import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { sequelize } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe } from '../helpers.js';

let t: string;
beforeAll(async () => {
  await sembrar();
  t = await tokenDe('admin');
});
afterAll(() => sequelize.close());

describe('Reportes y tablero (RF-10, RF-11)', () => {
  it('CP-47 el reporte de estaciones lista líneas, accesos y guardias', async () => {
    const r = await api().get('/api/reportes/estaciones').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(14);
    const trebol = r.body.find((e: any) => e.estacion === 'Trébol');
    expect(trebol.accesos).toBe(3);
    expect(trebol.guardias).toBe(3);
    expect(trebol.lineas.split(', ')).toHaveLength(4);
    expect(r.body.every((e: any) => e.cumple_guardia_minima)).toBe(true);
  });

  it('CP-48 el reporte de líneas muestra buses asignados y el rango permitido', async () => {
    const r = await api().get('/api/reportes/lineas-buses').set(auth(t));
    expect(r.body).toHaveLength(4);
    const l1 = r.body.find((l: any) => l.linea.startsWith('Línea 1'));
    expect(l1.estaciones).toBe(4);
    expect(l1.buses_asignados).toBe(5);
    expect(l1.rango_permitido).toBe('4 - 8');
    expect(r.body.every((l: any) => l.cumple_rango)).toBe(true);
  });

  it('CP-49 exporta a CSV con BOM y acentos', async () => {
    const r = await api().get('/api/reportes/lineas-buses?formato=csv').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text.startsWith('\uFEFF')).toBe(true);
    expect(r.text).toContain('Línea 1 Centro-Norte');
  });

  it('CP-50 el tablero coincide con los datos cargados', async () => {
    const r = await api().get('/api/dashboard').set(auth(t));
    expect(r.body.totales).toMatchObject({ lineas: 4, estaciones: 14, buses: 21, pilotos: 8, buses_sin_linea: 2 });
    expect(r.body.lineas_fuera_de_rango).toEqual([]);
  });

  it('CP-51 el personal municipal solo ve su municipalidad', async () => {
    const m = await tokenDe('municipal');
    const r = await api().get('/api/reportes/estaciones').set(auth(m));
    expect(r.body).toHaveLength(7); // Centra Norte, Zona 6, Plaza Barrios, Trébol, Zona Pradera, Zona 10, Obelisco
    expect(r.body.every((e: any) => e.municipalidad === 'Guatemala')).toBe(true);
  });

  it('el reporte de accesos por línea lista el orden de cada estación', async () => {
    const r = await api().get('/api/reportes/accesos-por-linea').set(auth(t));
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0]).toHaveProperty('acceso');
  });
});
