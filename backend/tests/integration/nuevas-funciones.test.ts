import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { sequelize, Usuario } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe } from '../helpers.js';

beforeEach(sembrar);
afterAll(() => sequelize.close());

const nuevoPasajero = async (email: string) => {
  const r = await api().post('/api/auth/registro').send({ nombre: 'Prueba Pasajero', email, password: 'Clave12345' });
  return r.body.token as string;
};
const solicitar = (t: string, cuerpo: object) => api().post('/api/mi/tarjetas/solicitar').set(auth(t)).send(cuerpo);

describe('Línea 4: San José Pinula a Trébol', () => {
  it('existe con sus 7 estaciones en orden y cumple el rango de buses', async () => {
    const t = await tokenDe('admin');
    const r = await api().get('/api/lineas/4/detalle').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body.paradas.map((p: any) => p.estacion.nombre)).toEqual([
      'San José Pinula', 'Santa Catarina Pinula', 'Condado Concepción', 'Zona Pradera', 'Zona 10', 'Obelisco', 'Trébol',
    ]);
    expect(Number(r.body.distancia_total_km)).toBeCloseTo(21.2, 1);
    expect(r.body.cumplimiento).toMatchObject({ estaciones: 7, buses: 7, min: 7, max: 14, cumple: true });
  });
});

describe('Solicitud de tarjeta con datos del pasajero', () => {
  it('exige teléfono y DPI o NIT la primera vez', async () => {
    const t = await nuevoPasajero('a@correo.com');
    expect((await solicitar(t, {})).status).toBe(400);
    expect((await solicitar(t, { telefono: '55550123' })).status).toBe(400); // falta DPI o NIT
    expect((await solicitar(t, { dpi: '1234567890123' })).status).toBe(400); // falta teléfono
  });

  it('valida el formato de teléfono, DPI y NIT', async () => {
    const t = await nuevoPasajero('b@correo.com');
    expect((await solicitar(t, { telefono: '123', dpi: '1234567890123' })).status).toBe(400);
    expect((await solicitar(t, { telefono: '55550123', dpi: '12345' })).status).toBe(400);
    expect((await solicitar(t, { telefono: '55550123', nit: 'abc' })).status).toBe(400);
  });

  it('con teléfono y DPI crea la tarjeta, guarda el DPI cifrado y lo muestra enmascarado', async () => {
    const t = await nuevoPasajero('c@correo.com');
    expect((await solicitar(t, { telefono: '+502 5555-0123', dpi: '23456789001012' })).status).toBe(400); // 14 dígitos: inválido
    const ok = await solicitar(t, { telefono: '+502 5555-0123', dpi: '2345678900101' });
    expect(ok.status).toBe(201);
    const perfil = (await api().get('/api/mi/perfil').set(auth(t))).body;
    expect(perfil).toMatchObject({ telefono: '55550123', completo: true, nit: null });
    expect(perfil.dpi).toBe('•••••••••0101');
    const u: any = await Usuario.findOne({ where: { email: 'c@correo.com' }, raw: true });
    expect(u.dpi_cifrado).not.toContain('2345678900101'); // nunca en claro
  });

  it('acepta NIT con dígito verificador K y no vuelve a pedir los datos', async () => {
    const t = await nuevoPasajero('d@correo.com');
    expect((await solicitar(t, { telefono: '55550123', nit: '1234567-K' })).status).toBe(201);
    expect((await solicitar(t, {})).status).toBe(201); // el perfil ya está completo
  });

  it('no permite usar el mismo DPI en dos cuentas', async () => {
    const a = await nuevoPasajero('e@correo.com');
    const b = await nuevoPasajero('f@correo.com');
    expect((await solicitar(a, { telefono: '55550123', dpi: '3456789010101' })).status).toBe(201);
    expect((await solicitar(b, { telefono: '55550124', dpi: '3456789010101' })).status).toBe(409);
  });
});

describe('Caja de sugerencias y quejas', () => {
  it('cualquier persona puede enviar una sugerencia sin cuenta', async () => {
    const r = await api().post('/api/publico/sugerencias').send({ tipo: 'QUEJA', mensaje: 'El bus de la línea 1 llegó muy tarde.', id_linea: 1 });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
  });

  it('rechaza mensajes muy cortos o tipos inválidos', async () => {
    expect((await api().post('/api/publico/sugerencias').send({ tipo: 'QUEJA', mensaje: 'corto' })).status).toBe(400);
    expect((await api().post('/api/publico/sugerencias').send({ tipo: 'OTRO', mensaje: 'Un mensaje suficientemente largo' })).status).toBe(400);
  });

  it('el administrador las lista y cambia su estado; otros roles no pueden verlas', async () => {
    await api().post('/api/publico/sugerencias').send({ tipo: 'SUGERENCIA', nombre: 'Ana', mensaje: 'Más buses los domingos, por favor.' });
    const admin = await tokenDe('admin');
    const lista = (await api().get('/api/sugerencias').set(auth(admin))).body;
    expect(lista).toHaveLength(1);
    expect(lista[0].estado).toBe('NUEVA');
    const r = await api().patch(`/api/sugerencias/${lista[0].id_sugerencia}`).set(auth(admin)).send({ estado: 'RESUELTA' });
    expect(r.body.estado).toBe('RESUELTA');
    for (const rol of ['operador', 'guardia', 'pasajero'] as const) {
      expect((await api().get('/api/sugerencias').set(auth(await tokenDe(rol)))).status).toBe(403);
    }
  });
});

describe('Horarios editables por el administrador', () => {
  const lunesViernes = { LUNES_VIERNES: { inicio: '04:30', fin: '22:00' }, SABADO: null, DOMINGO_FESTIVOS: null };

  it('el horario guardado aparece en la pantalla pública', async () => {
    const admin = await tokenDe('admin');
    expect((await api().put('/api/horarios/lineas/1').set(auth(admin)).send(lunesViernes)).status).toBe(200);
    const red = (await api().get('/api/publico/red')).body;
    const l1 = red.lineas.find((l: any) => l.id_linea === 1);
    expect(l1.horarios.LUNES_VIERNES).toEqual({ inicio: '04:30', fin: '22:00' });
    expect(l1.horarios.SABADO).toBeNull();
  });

  it('también se pueden definir horarios por estación', async () => {
    const admin = await tokenDe('admin');
    await api().put('/api/horarios/estaciones/1').set(auth(admin)).send(lunesViernes);
    const e1 = (await api().get('/api/publico/red')).body.estaciones.find((e: any) => e.id_estacion === 1);
    expect(e1.horarios.LUNES_VIERNES.inicio).toBe('04:30');
  });

  it('rechaza horas inválidas o un fin anterior al inicio', async () => {
    const admin = await tokenDe('admin');
    const malo = (f: object) => api().put('/api/horarios/lineas/1').set(auth(admin)).send({ ...lunesViernes, ...f });
    expect((await malo({ SABADO: { inicio: '25:00', fin: '26:00' } })).status).toBe(400);
    expect((await malo({ SABADO: { inicio: '20:00', fin: '05:00' } })).status).toBe(400);
  });

  it('solo el administrador edita; el personal municipal solo consulta', async () => {
    const muni = await tokenDe('municipal');
    expect((await api().get('/api/horarios').set(auth(muni))).status).toBe(200);
    expect((await api().put('/api/horarios/lineas/1').set(auth(muni)).send(lunesViernes)).status).toBe(403);
    expect((await api().put('/api/horarios/lineas/1').set(auth(await tokenDe('guardia'))).send(lunesViernes)).status).toBe(403);
  });
});
