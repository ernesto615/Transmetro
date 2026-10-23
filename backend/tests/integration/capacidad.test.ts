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

// Bus 1 tiene capacidad de 120 pasajeros.
const evaluar = (espera: number, abordo?: number) =>
  api().post('/api/ocupacion').set(auth(t)).send({ id_estacion: 1, id_bus: 1, pasajeros_en_espera: espera, pasajeros_a_bordo: abordo });

describe('Ocupación y alertas (RF-7)', () => {
  it('CP-29 genera alerta de sobrecupo con 150 % en espera', async () => {
    const r = await evaluar(180);
    expect(r.status).toBe(200);
    expect(r.body.sobrecupo).toBe(true);
    expect(r.body.alertas.map((a: any) => a.tipo)).toContain('SOBRECUPO');
    const lista = (await api().get('/api/alertas').set(auth(t))).body;
    expect(lista.some((a: any) => a.tipo === 'SOBRECUPO')).toBe(true);
  });

  it('CP-30 no genera alerta justo debajo del 150 %', async () => {
    const r = await evaluar(179);
    expect(r.body.sobrecupo).toBe(false);
    expect(r.body.alertas).toEqual([]);
  });

  it('CP-31 el bus con menos del 25 % espera 5 minutos más', async () => {
    const r = await evaluar(10, 29);
    expect(r.body.espera_adicional_min).toBe(5);
    expect(r.body.alertas.map((a: any) => a.tipo)).toContain('ESPERA_EXTRA');
  });

  it('CP-32 con 25 % o más no hay espera adicional', async () => {
    const r = await evaluar(10, 30);
    expect(r.body.espera_adicional_min).toBe(0);
    expect(r.body.alertas).toEqual([]);
  });

  it('CP-33 una alerta se marca como atendida y sale de las abiertas', async () => {
    const alerta = (await evaluar(200)).body.alertas[0];
    const r = await api().patch(`/api/alertas/${alerta.id_alerta}/atender`).set(auth(t));
    expect(r.status).toBe(200);
    const abiertas = (await api().get('/api/alertas?atendida=false').set(auth(t))).body;
    expect(abiertas.some((a: any) => a.id_alerta === alerta.id_alerta)).toBe(false);
  });

  it('el operador evalúa la ocupación de su propia estación sin indicar el id', async () => {
    const op = await tokenDe('operador');
    const r = await api().post('/api/ocupacion').set(auth(op)).send({ id_bus: 1, pasajeros_en_espera: 10, pasajeros_a_bordo: 60 });
    expect(r.status).toBe(200);
  });

  it('rechaza datos fuera de rango', async () => {
    expect((await evaluar(-5)).status).toBe(400);
  });
});

describe('Posición GPS e incidentes (RF-5, RF-8)', () => {
  it('CP-34 guarda la posición de un bus', async () => {
    const r = await api().post('/api/buses/1/posicion').set(auth(t)).send({ latitud: 14.65, longitud: -90.5 });
    expect(r.status).toBe(200);
    const bus = (await api().get('/api/buses/1').set(auth(t))).body;
    expect(Number(bus.latitud)).toBeCloseTo(14.65, 4);
    expect(bus.ultima_posicion).toBeTruthy();
  });

  it('CP-35 rechaza coordenadas inválidas', async () => {
    expect((await api().post('/api/buses/1/posicion').set(auth(t)).send({ latitud: 200, longitud: -90 })).status).toBe(400);
  });

  it('CP-36 el botón de pánico registra un incidente', async () => {
    const g = await tokenDe('guardia');
    const r = await api().post('/api/incidentes/panico').set(auth(g)).send({});
    expect(r.status).toBe(201);
    const lista = (await api().get('/api/incidentes').set(auth(t))).body;
    expect(lista.some((i: any) => i.tipo === 'PANICO')).toBe(true);
  });

  it('CP-37 registra un incidente de seguridad', async () => {
    const r = await api().post('/api/incidentes').set(auth(t)).send({ tipo: 'Robo', descripcion: 'Prueba', id_estacion: 1 });
    expect(r.status).toBe(201);
    expect((await api().get('/api/incidentes').set(auth(t))).body[0].tipo).toBe('Robo');
  });
});
