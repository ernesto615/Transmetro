import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { sequelize, TarjetaAcceso } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api } from '../helpers.js';

beforeAll(sembrar);
afterAll(() => sequelize.close());

describe('Pantalla pública del ciudadano (sin sesión)', () => {
  it('muestra la red de líneas y estaciones sin datos internos', async () => {
    const r = await api().get('/api/publico/red');
    expect(r.status).toBe(200);
    expect(r.body.resumen).toEqual({ lineas: 4, estaciones: 14, municipalidades: 5 });
    expect(r.body.tarifa).toBe(1);
    expect(r.body.estaciones.every((e: any) => typeof e.latitud === 'number')).toBe(true);
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['placa', 'piloto', 'password', 'guardia']) expect(texto).not.toContain(prohibido);
  });

  it('el recorrido de cada línea viene ordenado', async () => {
    const r = await api().get('/api/publico/red');
    for (const l of r.body.lineas) expect(l.paradas.map((p: any) => p.orden)).toEqual(l.paradas.map((_: any, i: number) => i + 1));
  });

  it('permite recargar una tarjeta sin iniciar sesión y no revela el saldo', async () => {
    const r = await api().post('/api/publico/recargar').send({ numero: 'TM-0002-2026', monto: 10 });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    expect(r.body).not.toHaveProperty('saldo');
    expect(r.body.tarjeta).toBe('TM-••••2026');
    expect(Number(((await TarjetaAcceso.findOne({ where: { numero: 'TM-0002-2026' } })) as any).saldo)).toBe(10.5);
  });

  it('rechaza tarjetas inexistentes y montos inválidos', async () => {
    expect((await api().post('/api/publico/recargar').send({ numero: 'TM-9999-9999', monto: 10 })).status).toBe(404);
    expect((await api().post('/api/publico/recargar').send({ numero: 'TM-0002-2026', monto: 0 })).status).toBe(400);
  });

  it('las rutas internas siguen cerradas sin sesión', async () => {
    expect((await api().get('/api/buses')).status).toBe(401);
    expect((await api().get('/api/pilotos')).status).toBe(401);
  });
});
