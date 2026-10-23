import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { sequelize } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe } from '../helpers.js';

let t: string;
beforeEach(async () => {
  await sembrar();
  t = await tokenDe('admin');
});
afterAll(() => sequelize.close());

const asignar = (bus: number, linea: number | null) => api().put(`/api/buses/${bus}/linea`).set(auth(t)).send({ id_linea: linea });
const nuevoBus = (placa: string, extra: object = {}) => api().post('/api/buses').set(auth(t)).send({ placa, capacidad_maxima: 100, id_parqueo: 1, ...extra });

describe('Líneas y estaciones (RF-1)', () => {
  it('CP-10 una estación puede pertenecer a varias líneas', async () => {
    const r = await api().get('/api/estaciones').set(auth(t));
    const trebol = r.body.find((e: any) => e.nombre === 'Trébol');
    expect(trebol.lineas.length).toBe(4); // líneas 1, 2, 3 y 4
  });

  it('CP-11 el recorrido queda ordenado y la distancia total es la suma de tramos', async () => {
    const r = await api().put('/api/lineas/3/estaciones').set(auth(t)).send({
      paradas: [{ id_estacion: 4, distancia_a_siguiente_km: 6 }, { id_estacion: 7, distancia_a_siguiente_km: 4.9 }, { id_estacion: 8, distancia_a_siguiente_km: 0 }],
    });
    expect(r.status).toBe(200);
    expect(Number(r.body.distancia_total_km)).toBeCloseTo(10.9, 2);
    expect(r.body.paradas.map((p: any) => p.orden)).toEqual([1, 2, 3]);
  });

  it('CP-12 rechaza repetir una estación en la misma línea', async () => {
    const r = await api().put('/api/lineas/3/estaciones').set(auth(t)).send({
      paradas: [{ id_estacion: 4, distancia_a_siguiente_km: 1 }, { id_estacion: 4, distancia_a_siguiente_km: 0 }],
    });
    expect(r.status).toBe(400);
  });

  it('CP-13 la distancia entre dos estaciones de una línea suma sus tramos', async () => {
    const r = await api().get('/api/estaciones/distancia?desde=1&hasta=3').set(auth(t));
    expect(r.body.km).toBeCloseTo(4.8, 2); // 1.7 + 3.1
    expect(r.body.metodo).toBe('recorrido de la línea');
  });

  it('CP-14 sin línea en común usa la distancia en línea recta', async () => {
    const r = await api().get('/api/estaciones/distancia?desde=1&hasta=8').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body.km).toBeGreaterThan(0);
    expect(r.body.metodo).toContain('línea recta');
  });

  it('CP-15 exige municipalidad al crear línea y estación', async () => {
    expect((await api().post('/api/lineas').set(auth(t)).send({ nombre: 'Sin muni' })).status).toBe(400);
    expect((await api().post('/api/estaciones').set(auth(t)).send({ nombre: 'Sin muni' })).status).toBe(400);
  });

  it('CP-16 y CP-17 el reporte señala los accesos sin guardia', async () => {
    const acceso = await api().post('/api/accesos').set(auth(t)).send({ nombre: 'Acceso nuevo', id_estacion: 2 });
    expect(acceso.status).toBe(201);
    let rep = (await api().get('/api/reportes/estaciones').set(auth(t))).body.find((e: any) => e.id_estacion === 2);
    expect(rep.cumple_guardia_minima).toBe(false);
    expect(rep.accesos_sin_guardia).toContain('Acceso nuevo');
    await api().post('/api/guardias').set(auth(t)).send({ nombre: 'Guardia nuevo', id_acceso: acceso.body.id_acceso });
    rep = (await api().get('/api/reportes/estaciones').set(auth(t))).body.find((e: any) => e.id_estacion === 2);
    expect(rep.cumple_guardia_minima).toBe(true);
  });
});

describe('Buses y parqueos (RF-3, RF-4, RNF-6)', () => {
  it('CP-19 asigna un bus sin línea dentro del rango', async () => {
    expect((await asignar(13, 1)).status).toBe(200);
    const c = (await api().get('/api/lineas/1/cumplimiento').set(auth(t))).body;
    expect(c.buses).toBe(6);
    expect(c.cumple).toBe(true);
  });

  it('CP-20 rechaza superar el máximo de 2N buses', async () => {
    expect((await asignar(13, 1)).status).toBe(200); // 6
    expect((await asignar(14, 1)).status).toBe(200); // 7
    expect((await nuevoBus('TM-901', { id_linea: 1 })).status).toBe(201); // 8 = máximo (2 x 4)
    const r = await nuevoBus('TM-902', { id_linea: 1 });
    expect(r.status).toBe(409);
  });

  it('CP-21 no deja la línea por debajo del mínimo', async () => {
    const r = await asignar(10, null); // línea 3: 3 buses y 3 estaciones
    expect(r.status).toBe(409);
    expect((await api().get('/api/lineas/3/cumplimiento').set(auth(t))).body.buses).toBe(3);
  });

  it('CP-22 no asigna buses a una línea sin estaciones', async () => {
    const linea = await api().post('/api/lineas').set(auth(t)).send({ nombre: 'Línea vacía', id_municipalidad: 1 });
    expect(linea.status).toBe(201);
    expect((await asignar(13, linea.body.id_linea)).status).toBe(409);
  });

  it('CP-23 un bus pertenece a una sola línea', async () => {
    expect((await asignar(1, 2)).status).toBe(200); // de la línea 1 a la 2
    const l1 = (await api().get('/api/lineas/1/detalle').set(auth(t))).body;
    const l2 = (await api().get('/api/lineas/2/detalle').set(auth(t))).body;
    expect(l1.buses.some((b: any) => b.id_bus === 1)).toBe(false);
    expect(l2.buses.some((b: any) => b.id_bus === 1)).toBe(true);
  });

  it('CP-24 no permite crear un bus sin parqueo', async () => {
    const r = await api().post('/api/buses').set(auth(t)).send({ placa: 'TM-950', capacidad_maxima: 100 });
    expect(r.status).toBe(400);
  });

  it('CP-25 el cambio de parqueo es obligatorio y queda en el historial', async () => {
    expect((await api().put('/api/buses/1/parqueo').set(auth(t)).send({ id_parqueo: null })).status).toBe(400);
    expect((await api().put('/api/buses/1/parqueo').set(auth(t)).send({ id_parqueo: 2 })).status).toBe(200);
    const h = (await api().get('/api/buses/1/historial').set(auth(t))).body;
    expect(h.some((x: any) => x.id_parqueo_nuevo === 2)).toBe(true); // CP-28
  });

  it('CP-26 la capacidad máxima debe ser mayor que cero', async () => {
    expect((await nuevoBus('TM-960', { capacidad_maxima: 0 })).status).toBe(400);
  });

  it('CP-27 registra un piloto asociado a su bus y su línea', async () => {
    const r = await api().post('/api/pilotos').set(auth(t)).send({
      nombre: 'Piloto Nuevo', historial_educativo: 'Bachiller', direccion_residencia: 'Zona 1', telefono: '5555-0000', email: 'p@x.com', id_bus: 13,
    });
    expect(r.status).toBe(201);
    const lista = (await api().get('/api/pilotos').set(auth(t))).body;
    expect(lista.find((p: any) => p.nombre === 'Piloto Nuevo').bus.placa).toBe('TM-112');
  });
});
