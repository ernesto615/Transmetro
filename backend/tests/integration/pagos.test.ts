import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { sequelize, TarjetaAcceso } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe } from '../helpers.js';

beforeEach(sembrar);
afterAll(() => sequelize.close());

const saldoDe = async (numero: string) => Number(((await TarjetaAcceso.findOne({ where: { numero } })) as any).saldo);

describe('Cobros con tarjeta (RF-9)', () => {
  it('CP-39 cobra el pasaje y registra la transacción', async () => {
    const op = await tokenDe('operador');
    const r = await api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0001-2026', referencia: 'cobro-1' });
    expect(r.status).toBe(201);
    expect(await saldoDe('TM-0001-2026')).toBe(24); // Q25 - tarifa base Q1
    const tx = (await api().get('/api/pagos').set(auth(op))).body;
    expect(tx).toHaveLength(1);
    expect(tx[0].estacion.nombre).toBe('Centra Norte');
    expect(tx[0].medio_pago).toBe('TARJETA');
  });

  it('CP-40 con saldo insuficiente no cobra ni registra la transacción', async () => {
    const op = await tokenDe('operador');
    const r = await api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0002-2026', referencia: 'cobro-2' }); // saldo Q0.50
    expect(r.status).toBe(409);
    expect(await saldoDe('TM-0002-2026')).toBe(0.5);
    expect((await api().get('/api/pagos').set(auth(op))).body).toHaveLength(0);
  });

  it('CP-41 repetir la misma referencia no cobra dos veces', async () => {
    const op = await tokenDe('operador');
    const body = { numero_tarjeta: 'TM-0001-2026', referencia: 'misma-ref' };
    const a = await api().post('/api/pagos').set(auth(op)).send(body);
    const b = await api().post('/api/pagos').set(auth(op)).send(body);
    expect(a.body.duplicada).toBe(false);
    expect(b.body.duplicada).toBe(true);
    expect(await saldoDe('TM-0001-2026')).toBe(24);
  });

  it('CP-42 dos cobros simultáneos con saldo para uno solo: solo uno se aprueba', async () => {
    await TarjetaAcceso.update({ saldo: 1 }, { where: { numero: 'TM-0002-2026' } });
    const op = await tokenDe('operador');
    const pago = (ref: string) => api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0002-2026', referencia: ref });
    const [a, b] = await Promise.all([pago('sim-1'), pago('sim-2')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await saldoDe('TM-0002-2026')).toBe(0); // nunca negativo
  });

  it('CP-43 el operador recarga en su estación', async () => {
    const op = await tokenDe('operador');
    const r = await api().post('/api/tarjetas/recargar').set(auth(op)).send({ numero: 'TM-0002-2026', monto: 10, referencia: 'rec-1' });
    expect(r.status).toBe(200);
    expect(await saldoDe('TM-0002-2026')).toBe(10.5);
  });
});

describe('Portal del pasajero (RF-9)', () => {
  it('CP-44 crea cuenta y solicita una tarjeta propia', async () => {
    const reg = await api().post('/api/auth/registro').send({ nombre: 'Ana Pérez', email: 'ana@correo.com', password: 'Clave12345' });
    expect(reg.status).toBe(201);
    const t = reg.body.token;
    const tarjeta = await api().post('/api/mi/tarjetas/solicitar').set(auth(t)).send({});
    expect(tarjeta.status).toBe(201);
    expect(tarjeta.body.numero).toMatch(/^TM-\d{8}-\d{4}$/);
    expect((await api().get('/api/mi/tarjetas').set(auth(t))).body).toHaveLength(1);
  });

  it('CP-45 recarga en línea: sube el saldo y el movimiento queda sin estación', async () => {
    const t = await tokenDe('pasajero');
    const r = await api().post('/api/mi/recargar').set(auth(t)).send({ numero: 'TM-0001-2026', monto: 20 });
    expect(r.status).toBe(201);
    expect(await saldoDe('TM-0001-2026')).toBe(45);
    const h = (await api().get('/api/mi/tarjetas/TM-0001-2026/historial').set(auth(t))).body;
    expect(h.movimientos[0].medio_pago).toBe('RECARGA_EN_LINEA');
    expect(h.movimientos[0].id_estacion).toBeNull();
  });

  it('CP-46 ve su historial con el último uso y no el de tarjetas ajenas', async () => {
    const op = await tokenDe('operador');
    await api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0001-2026', referencia: 'uso-1' });
    const t = await tokenDe('pasajero');
    const h = (await api().get('/api/mi/tarjetas/TM-0001-2026/historial').set(auth(t))).body;
    expect(h.ultimo_uso.estacion).toBe('Centra Norte');
    expect((await api().get('/api/mi/tarjetas/TM-0002-2026/historial').set(auth(t))).status).toBe(404);
  });

  it('no permite recargar una tarjeta que no es suya', async () => {
    const t = await tokenDe('pasajero');
    expect((await api().post('/api/mi/recargar').set(auth(t)).send({ numero: 'TM-0002-2026', monto: 10 })).status).toBe(404);
  });

  it('una tarjeta ya vinculada no se puede vincular a otra cuenta', async () => {
    const a = await tokenDe('pasajero');
    expect((await api().post('/api/mi/tarjetas/vincular').set(auth(a)).send({ numero: 'TM-0003-2026' })).status).toBe(200);
    const reg = await api().post('/api/auth/registro').send({ nombre: 'Otro', email: 'otro@correo.com', password: 'Clave12345' });
    const r = await api().post('/api/mi/tarjetas/vincular').set(auth(reg.body.token)).send({ numero: 'TM-0003-2026' });
    expect(r.status).toBe(409);
  });
});
