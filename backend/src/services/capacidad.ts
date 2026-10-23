import { Alerta, Bus, Estacion } from '../db.js';
import { notFound } from '../lib/http.js';
import { emitir } from '../realtime.js';

export const UMBRAL_SOBRECUPO = 1.5; // pasajeros en espera >= 150% de la capacidad del bus (RF-7)
export const UMBRAL_SUBOCUPACION = 0.25; // bus con menos del 25% de ocupación
export const ESPERA_ADICIONAL_MIN = 5;

export interface OcupacionInput {
  id_estacion: number;
  id_bus: number;
  pasajeros_en_espera: number;
  pasajeros_a_bordo?: number;
}

// Cálculo puro (sin base de datos): fácil de probar con pruebas unitarias.
export function calcularOcupacion(pasajerosEnEspera: number, capacidad: number, pasajerosABordo?: number) {
  const ocupacionEspera = pasajerosEnEspera / capacidad;
  const ocupacionBus = pasajerosABordo === undefined ? null : pasajerosABordo / capacidad;
  return {
    ocupacionEspera,
    ocupacionBus,
    sobrecupo: ocupacionEspera >= UMBRAL_SOBRECUPO,
    esperaAdicionalMin: ocupacionBus !== null && ocupacionBus < UMBRAL_SUBOCUPACION ? ESPERA_ADICIONAL_MIN : 0,
  };
}

async function crearAlerta(tipo: string, id_estacion: number, id_bus: number, descripcion: string) {
  const alerta: any = await Alerta.create({ tipo, id_estacion, id_bus, descripcion });
  emitir('alerta', alerta.toJSON());
  return alerta.toJSON();
}

export async function evaluarOcupacion(d: OcupacionInput) {
  const [estacion, bus]: any[] = await Promise.all([Estacion.findByPk(d.id_estacion), Bus.findByPk(d.id_bus)]);
  if (!estacion) throw notFound('Estación no encontrada');
  if (!bus) throw notFound('Bus no encontrado');

  const calc = calcularOcupacion(d.pasajeros_en_espera, bus.capacidad_maxima, d.pasajeros_a_bordo);
  const { ocupacionEspera, ocupacionBus, esperaAdicionalMin } = calc;
  const alertas: any[] = [];

  if (calc.sobrecupo) {
    alertas.push(
      await crearAlerta(
        'SOBRECUPO',
        estacion.id_estacion,
        bus.id_bus,
        `${estacion.nombre}: ${d.pasajeros_en_espera} pasajeros en espera (${Math.round(ocupacionEspera * 100)}% de la capacidad del bus ${bus.placa}). Despachar una unidad adicional.`,
      ),
    );
  }

  if (esperaAdicionalMin > 0 && ocupacionBus !== null) {
    alertas.push(
      await crearAlerta(
        'ESPERA_EXTRA',
        estacion.id_estacion,
        bus.id_bus,
        `Bus ${bus.placa} con ${Math.round(ocupacionBus * 100)}% de ocupación en ${estacion.nombre}: esperar ${ESPERA_ADICIONAL_MIN} minutos adicionales.`,
      ),
    );
  }

  return {
    ocupacion_espera_pct: Math.round(ocupacionEspera * 100),
    ocupacion_bus_pct: ocupacionBus === null ? null : Math.round(ocupacionBus * 100),
    sobrecupo: calc.sobrecupo,
    espera_adicional_min: esperaAdicionalMin,
    alertas,
  };
}
