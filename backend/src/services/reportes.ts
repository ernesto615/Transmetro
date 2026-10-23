import { fn, col, Op } from 'sequelize';
import { Alerta, Bus, Estacion, Linea, LineaEstacion, Transaccion, Piloto, IncidenteSeguridad, TarjetaAcceso } from '../db.js';
import { limitesBuses } from './lineas.js';
import { analizarDemanda } from './demanda.js';

// RF-10: estaciones con sus líneas, accesos, guardias y parqueos.
export async function reporteEstaciones(idMunicipalidad?: number | null) {
  const estaciones: any[] = await Estacion.findAll({
    where: idMunicipalidad ? { id_municipalidad: idMunicipalidad } : {},
    include: [
      { association: 'municipalidad' },
      { association: 'lineas', include: [{ association: 'linea', attributes: ['id_linea', 'nombre'] }] },
      { association: 'accesos', include: [{ association: 'guardias' }] },
      { association: 'parqueos' },
      { association: 'operadores' },
    ],
    order: [['nombre', 'ASC']],
  });
  return estaciones.map((e) => {
    const accesos = e.accesos ?? [];
    return {
      id_estacion: e.id_estacion,
      estacion: e.nombre,
      municipalidad: e.municipalidad?.nombre,
      lineas: (e.lineas ?? []).map((l: any) => l.linea.nombre).join(', '),
      accesos: accesos.length,
      guardias: accesos.reduce((s: number, a: any) => s + a.guardias.length, 0),
      accesos_sin_guardia: accesos.filter((a: any) => a.guardias.length === 0).map((a: any) => a.nombre).join(', '),
      parqueos: (e.parqueos ?? []).length,
      operadores: (e.operadores ?? []).map((o: any) => o.nombre).join(', '),
      cumple_guardia_minima: accesos.length > 0 && accesos.every((a: any) => a.guardias.length >= 1),
    };
  });
}

// RF-10: líneas con sus buses asignados y verificación del rango permitido.
export async function reporteLineasBuses(idMunicipalidad?: number | null) {
  const lineas: any[] = await Linea.findAll({
    where: idMunicipalidad ? { id_municipalidad: idMunicipalidad } : {},
    include: [
      { association: 'municipalidad' },
      { association: 'paradas' },
      { association: 'buses', include: [{ association: 'parqueo' }, { association: 'pilotos' }] },
    ],
    order: [['nombre', 'ASC']],
  });
  return lineas.map((l) => {
    const n = l.paradas.length;
    const { min, max } = limitesBuses(n);
    return {
      id_linea: l.id_linea,
      linea: l.nombre,
      municipalidad: l.municipalidad?.nombre,
      distancia_total_km: Number(l.distancia_total_km),
      estaciones: n,
      buses_asignados: l.buses.length,
      rango_permitido: `${min} - ${max}`,
      cumple_rango: n > 0 && l.buses.length >= min && l.buses.length <= max,
      buses: l.buses.map((b: any) => ({
        id_bus: b.id_bus,
        placa: b.placa,
        capacidad: b.capacidad_maxima,
        parqueo: b.parqueo?.nombre,
        pilotos: b.pilotos.map((p: any) => p.nombre).join(', '),
      })),
    };
  });
}

// Requerimiento 8: todos los accesos de cada línea (a través de sus estaciones).
export async function reporteAccesosPorLinea() {
  const lineas: any[] = await Linea.findAll({
    include: [{ association: 'paradas', include: [{ association: 'estacion', include: [{ association: 'accesos' }] }] }],
    order: [['nombre', 'ASC'], [{ model: LineaEstacion, as: 'paradas' }, 'orden', 'ASC']],
  });
  return lineas.flatMap((l) =>
    l.paradas.flatMap((p: any) =>
      p.estacion.accesos.map((a: any) => ({ linea: l.nombre, orden: p.orden, estacion: p.estacion.nombre, acceso: a.nombre })),
    ),
  );
}

export async function dashboard(idMunicipalidad?: number | null) {
  const wl = idMunicipalidad ? { id_municipalidad: idMunicipalidad } : {};
  const [lineas, estaciones, buses, pilotos, sinLinea, alertasAbiertas, incidentes7d] = await Promise.all([
    Linea.count({ where: wl }),
    Estacion.count({ where: wl }),
    Bus.count(),
    Piloto.count(),
    Bus.count({ where: { id_linea: null } }),
    Alerta.count({ where: { atendida: false } }),
    IncidenteSeguridad.count({ where: { fecha_hora: { [Op.gte]: new Date(Date.now() - 7 * 864e5) } } }),
  ]);
  const reporte = await reporteLineasBuses(idMunicipalidad);
  const alertasPorTipo = await Alerta.findAll({
    attributes: ['tipo', [fn('COUNT', col('id_alerta')), 'total']],
    group: ['tipo'],
    raw: true,
  });
  const recaudo: any = await Transaccion.findOne({
    attributes: [[fn('COALESCE', fn('SUM', col('monto')), 0), 'total']],
    where: { medio_pago: 'TARJETA' },
    raw: true,
  });
  const tarjetas = await TarjetaAcceso.count();
  const demanda = await analizarDemanda(30);
  return {
    totales: { lineas, estaciones, buses, pilotos, buses_sin_linea: sinLinea, alertas_abiertas: alertasAbiertas, incidentes_7d: incidentes7d, tarjetas },
    lineas_fuera_de_rango: reporte.filter((l) => !l.cumple_rango).map((l) => ({ id_linea: l.id_linea, linea: l.linea, buses: l.buses_asignados, rango: l.rango_permitido })),
    buses_por_linea: reporte.map((l) => ({ linea: l.linea, buses: l.buses_asignados, min: Number(l.rango_permitido.split(' - ')[0]), max: Number(l.rango_permitido.split(' - ')[1]) })),
    alertas_por_tipo: alertasPorTipo,
    recaudo_total: Number(recaudo?.total ?? 0),
    capacidad: { ...demanda.resumen, carga_promedio_red: demanda.carga_promedio_red },
  };
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// BOM para que Excel abra bien los acentos.
export const toCsv = (filas: Record<string, unknown>[]) => {
  if (filas.length === 0) return '\uFEFF';
  const cols = Object.keys(filas[0]);
  return '\uFEFF' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\r\n');
};
