import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { sequelize, Alerta, Bus, Transaccion } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe } from '../helpers.js';

beforeEach(sembrar);
afterAll(() => sequelize.close());

const hoy = () => new Date().toISOString().slice(0, 10);

describe('Pasajes con línea (base del análisis de demanda)', () => {
  it('deduce la línea cuando la estación pertenece a una sola', async () => {
    const op = await tokenDe('operador'); // opera en Centra Norte (solo línea 1)
    await api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0001-2026', referencia: 'l1' });
    const tx: any = await Transaccion.findOne({ where: { referencia: 'l1' } });
    expect(tx.id_linea).toBe(1);
  });

  it('en una estación con varias líneas guarda la que se indique y valida que pertenezca', async () => {
    const admin = await tokenDe('admin');
    const pago = (extra: object, ref: string) => api().post('/api/pagos').set(auth(admin)).send({ numero_tarjeta: 'TM-0003-2026', id_estacion: 4, referencia: ref, ...extra }); // Trébol
    const sinLinea = await pago({}, 'v0');
    expect(sinLinea.status).toBe(201);
    expect(((await Transaccion.findOne({ where: { referencia: 'v0' } })) as any).id_linea).toBeNull();
    expect((await pago({ id_linea: 2 }, 'v1')).status).toBe(201);
    expect(((await Transaccion.findOne({ where: { referencia: 'v1' } })) as any).id_linea).toBe(2);
    expect((await pago({ id_linea: 99 }, 'v2')).status).toBe(400); // no pertenece a esa línea
  });
});

describe('Dashboard financiero (RF administración)', () => {
  const movimiento = (t: string, cuerpo: object) => api().post('/api/finanzas/movimientos').set(auth(t)).send(cuerpo);

  it('solo el administrador accede a las finanzas', async () => {
    for (const rol of ['municipal', 'operador', 'guardia', 'pasajero'] as const) {
      expect((await api().get('/api/finanzas/resumen').set(auth(await tokenDe(rol)))).status).toBe(403);
    }
  });

  it('registra ingresos y egresos y calcula el flujo de caja', async () => {
    const admin = await tokenDe('admin');
    const op = await tokenDe('operador');
    await api().post('/api/pagos').set(auth(op)).send({ numero_tarjeta: 'TM-0001-2026', referencia: 'f1' });              // pasaje Q1
    await api().post('/api/tarjetas/recargar').set(auth(op)).send({ numero: 'TM-0002-2026', monto: 10, referencia: 'f2' }); // recarga Q10
    expect((await movimiento(admin, { tipo: 'INGRESO', categoria: 'Subsidio municipal', monto: 5000, fecha: hoy() })).status).toBe(201);
    expect((await movimiento(admin, { tipo: 'EGRESO', categoria: 'Combustible', monto: 1200, fecha: hoy() })).status).toBe(201);

    const r = (await api().get('/api/finanzas/resumen?meses=2').set(auth(admin))).body;
    expect(r.kpis.entradas_recargas).toBe(10);
    expect(r.kpis.entradas_otras).toBe(5000);
    expect(r.kpis.entradas).toBe(5010);
    expect(r.kpis.salidas).toBe(1200);
    expect(r.kpis.flujo_neto).toBe(3810);
    expect(r.kpis.ingreso_pasajes).toBe(1);
    expect(r.kpis.pasajes).toBe(1);
    expect(r.kpis.cobertura_costos_pct).toBeCloseTo(0.08, 2); // Q1 de pasajes frente a Q1,200 de gastos
    expect(r.mensual).toHaveLength(2);
    expect(r.egresos_por_categoria).toEqual([{ categoria: 'Combustible', total: 1200 }]);
    // saldo de las tarjetas: 25 - 1 + 0.5 + 10 + 100
    expect(r.kpis.pasivo_prepago).toBe(134.5);
  });

  it('valida los datos del movimiento y permite eliminarlo', async () => {
    const admin = await tokenDe('admin');
    expect((await movimiento(admin, { tipo: 'EGRESO', categoria: 'Combustible', monto: -5, fecha: hoy() })).status).toBe(400);
    expect((await movimiento(admin, { tipo: 'OTRO', categoria: 'Combustible', monto: 5, fecha: hoy() })).status).toBe(400);
    expect((await movimiento(admin, { tipo: 'EGRESO', categoria: 'Combustible', monto: 5, fecha: '31/12/2026' })).status).toBe(400);
    const ok = await movimiento(admin, { tipo: 'EGRESO', categoria: 'Seguros', monto: 300, fecha: hoy() });
    expect((await api().delete(`/api/finanzas/movimientos/${ok.body.id_movimiento}`).set(auth(admin))).status).toBe(204);
    expect((await api().get('/api/finanzas/movimientos').set(auth(admin))).body).toHaveLength(0);
  });
});

describe('Demanda y alertas de capacidad', () => {
  // inserta n pasajes de una línea repartidos en los últimos días
  const pasajes = (linea: number, estacion: number, n: number) =>
    Transaccion.bulkCreate(Array.from({ length: n }, (_, i) => ({
      id_tarjeta: 1, id_estacion: estacion, id_linea: linea, monto: 1, medio_pago: 'TARJETA', fecha_hora: new Date(Date.now() - (i % 10) * 864e5),
    })) as any);

  async function escenario() {
    await pasajes(1, 1, 900);
    await pasajes(2, 5, 240);
    await pasajes(3, 7, 90);
    await pasajes(4, 9, 210);
    const admin = await tokenDe('admin');
    // dos buses más en la línea 4 (queda con 9 y su mínimo es 7)
    await api().put('/api/buses/13/linea').set(auth(admin)).send({ id_linea: 4 });
    await api().put('/api/buses/14/linea').set(auth(admin)).send({ id_linea: 4 });
    return admin;
  }

  it('indica cuál es la línea más usada y recomienda agregar buses o una línea nueva', async () => {
    const admin = await escenario();
    const r = (await api().get('/api/demanda?dias=30').set(auth(admin))).body;
    expect(r.lineas[0].id_linea).toBe(1);
    expect(r.lineas[0]).toMatchObject({ nivel: 'CRITICA', accion: 'AGREGAR_BUSES', buses_a_agregar: 3, necesita_linea_nueva: true });
    expect(r.lineas[0].estaciones_mas_usadas).toEqual(['Centra Norte']);
    const l4 = r.lineas.find((l: any) => l.id_linea === 4);
    expect(l4).toMatchObject({ nivel: 'BAJA', buses_liberables: 2 });
    expect(r.resumen).toMatchObject({ criticas: 1, bajas: 1 });
    expect(r.serie_diaria.length).toBeGreaterThan(0);
  });

  it('las alertas de sobrecupo recientes elevan el nivel de una línea', async () => {
    const admin = await tokenDe('admin');
    await pasajes(1, 1, 300);
    await pasajes(2, 5, 60); // sin alertas esta línea estaría en nivel normal
    const bus: any = await Bus.findOne({ where: { id_linea: 2 } });
    await Alerta.bulkCreate(Array.from({ length: 5 }, () => ({ tipo: 'SOBRECUPO', id_bus: bus.id_bus, id_estacion: 5, descripcion: 'prueba' })) as any);
    const r = (await api().get('/api/demanda').set(auth(admin))).body;
    expect(r.lineas.find((l: any) => l.id_linea === 2).nivel).toBe('CRITICA');
  });

  it('notifica al centro de control sin repetir alertas abiertas', async () => {
    const admin = await escenario();
    const a = await api().post('/api/demanda/notificar').set(auth(admin));
    expect(a.body.creadas).toBe(1); // solo la línea crítica; la de baja demanda no genera alerta
    const lista = (await api().get('/api/alertas?atendida=false').set(auth(admin))).body;
    expect(lista.filter((x: any) => x.tipo === 'REFUERZO_FLOTA')).toHaveLength(1);
    expect((await api().post('/api/demanda/notificar').set(auth(admin))).body.creadas).toBe(0);
  });

  it('el tablero resume las recomendaciones de capacidad', async () => {
    const admin = await escenario();
    const d = (await api().get('/api/dashboard').set(auth(admin))).body;
    expect(d.capacidad).toMatchObject({ criticas: 1, bajas: 1 });
  });

  it('el personal municipal consulta la demanda; operador y pasajero no; solo el admin notifica', async () => {
    expect((await api().get('/api/demanda').set(auth(await tokenDe('municipal')))).status).toBe(200);
    expect((await api().get('/api/demanda').set(auth(await tokenDe('operador')))).status).toBe(403);
    expect((await api().get('/api/demanda').set(auth(await tokenDe('pasajero')))).status).toBe(403);
    expect((await api().post('/api/demanda/notificar').set(auth(await tokenDe('municipal')))).status).toBe(403);
  });
});
