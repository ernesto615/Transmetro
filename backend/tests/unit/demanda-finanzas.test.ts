import { describe, it, expect } from '@jest/globals';
import { evaluarLineas, textoRecomendacion, type LineaDemanda } from '../../src/services/demanda.js';
import { armarFlujo } from '../../src/services/finanzas.js';

const base = (o: Partial<LineaDemanda>): LineaDemanda => ({
  id_linea: 1, nombre: 'Línea X', estaciones: 4, buses: 4, capacidad: 480, pasajes: 120, pasajes_anterior: 120, sobrecupos_7d: 0, ...o,
});

// Escenario de 30 días: Línea 1 muy usada, Línea 4 con buses de sobra
const escenario = () => [
  base({ id_linea: 1, nombre: 'Línea 1', estaciones: 4, buses: 5, pasajes: 900, pasajes_anterior: 700 }),
  base({ id_linea: 2, nombre: 'Línea 2', estaciones: 4, buses: 4, pasajes: 240 }),
  base({ id_linea: 3, nombre: 'Línea 3', estaciones: 3, buses: 3, pasajes: 90 }),
  base({ id_linea: 4, nombre: 'Línea 4', estaciones: 7, buses: 9, pasajes: 210 }),
];

describe('Demanda por línea y recomendaciones de capacidad', () => {
  const r = evaluarLineas(escenario(), 30);
  const l = (id: number) => r.lineas.find((x) => x.id_linea === id)!;

  it('ordena las líneas de la más a la menos usada y calcula su participación', () => {
    expect(r.lineas.map((x) => x.id_linea)).toEqual([1, 2, 4, 3]);
    expect(r.total_pasajes).toBe(1440);
    expect(l(1).participacion_pct).toBeCloseTo(62.5, 1);
  });

  it('calcula la carga promedio de la red en pasajes por bus por día', () => {
    expect(r.carga_promedio_red).toBeCloseTo(2.3, 1); // 48 pasajes/día entre 21 buses
  });

  it('marca como crítica la línea con carga muy superior al promedio y sugiere buses hasta su máximo', () => {
    expect(l(1).nivel).toBe('CRITICA');
    expect(l(1).accion).toBe('AGREGAR_BUSES');
    expect(l(1).buses_a_agregar).toBe(3); // tiene 5 y el máximo es 8 (2 x 4 estaciones)
    expect(l(1).necesita_linea_nueva).toBe(true); // aun con 8 buses la demanda no se cubre
  });

  it('detecta crecimiento frente al período anterior', () => {
    expect(l(1).crecimiento_pct).toBeCloseTo(28.6, 1);
  });

  it('marca como baja la línea con buses de sobra y calcula cuántos se pueden reasignar sin bajar del mínimo', () => {
    expect(l(4).nivel).toBe('BAJA');
    expect(l(4).buses_liberables).toBe(2); // 9 buses, mínimo 7
  });

  it('no marca como baja una línea que ya está en su mínimo de buses', () => {
    expect(l(3).nivel).toBe('NORMAL');
    expect(l(3).accion).toBe('NINGUNA');
  });

  it('propone una línea nueva o un servicio expreso cuando la línea saturada ya tiene su máximo de buses', () => {
    const x = evaluarLineas([base({ estaciones: 3, buses: 6, pasajes: 3000 }), base({ id_linea: 2, buses: 4, pasajes: 100 })], 30);
    expect(x.lineas[0].nivel).toBe('CRITICA');
    expect(x.lineas[0].accion).toBe('NUEVA_LINEA_O_EXPRESO');
    expect(x.lineas[0].buses_a_agregar).toBe(0);
  });

  it('las alertas de sobrecupo también hacen crítica a una línea', () => {
    const x = evaluarLineas([base({ id_linea: 1, pasajes: 120, sobrecupos_7d: 5 }), base({ id_linea: 2, pasajes: 120 })], 30);
    expect(x.lineas.find((z) => z.id_linea === 1)!.nivel).toBe('CRITICA');
  });

  it('con pocos pasajes dice que no hay datos suficientes', () => {
    expect(evaluarLineas([base({ pasajes: 10 })], 30).lineas[0].nivel).toBe('SIN_DATOS');
  });

  it('redacta la recomendación', () => {
    expect(textoRecomendacion(l(1))).toContain('Agregar 3 buses');
    expect(textoRecomendacion(l(4))).toContain('reasignar 2 buses');
    expect(textoRecomendacion(l(3))).toBe('');
  });
});

describe('Flujo de caja mensual', () => {
  it('calcula entradas, flujo neto y acumulado', () => {
    const f = armarFlujo([
      { mes: '2026-09', entradas_recargas: 1000, entradas_otras: 500, salidas: 1200, ingreso_pasajes: 900, pasajes: 900 },
      { mes: '2026-10', entradas_recargas: 800, entradas_otras: 0, salidas: 1500, ingreso_pasajes: 700, pasajes: 700 },
    ]);
    expect(f[0]).toMatchObject({ entradas: 1500, neto: 300, acumulado: 300 });
    expect(f[1]).toMatchObject({ entradas: 800, neto: -700, acumulado: -400 });
  });
});
