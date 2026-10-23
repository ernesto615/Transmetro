import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { sequelize, Usuario } from '../../src/db.js';
import { sembrar } from '../../src/seed.js';
import { api, auth, tokenDe, CUENTAS } from '../helpers.js';

beforeAll(sembrar);
afterAll(() => sequelize.close());

describe('Autenticación y roles (RNF-3)', () => {
  it('CP-01 inicia sesión con credenciales válidas', async () => {
    const r = await api().post('/api/auth/login').send({ email: CUENTAS.admin[0], password: CUENTAS.admin[1] });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.usuario.rol).toBe('admin');
  });

  it('CP-02 rechaza una contraseña incorrecta con mensaje genérico', async () => {
    const r = await api().post('/api/auth/login').send({ email: CUENTAS.admin[0], password: 'incorrecta' });
    const r2 = await api().post('/api/auth/login').send({ email: 'noexiste@x.com', password: 'incorrecta' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe(r2.body.error); // no revela si el correo existe
  });

  it('CP-03 exige token', async () => {
    expect((await api().get('/api/lineas')).status).toBe(401);
    expect((await api().get('/api/lineas').set('Authorization', 'Bearer inventado')).status).toBe(401);
  });

  it('CP-04 un guardia no puede crear líneas', async () => {
    const t = await tokenDe('guardia');
    const r = await api().post('/api/lineas').set(auth(t)).send({ nombre: 'No permitida', id_municipalidad: 1 });
    expect(r.status).toBe(403);
  });

  it('CP-05 un operador solo actúa sobre su estación', async () => {
    const t = await tokenDe('operador');
    const r = await api().post('/api/ocupacion').set(auth(t)).send({ id_estacion: 2, id_bus: 1, pasajeros_en_espera: 10 });
    expect(r.status).toBe(403);
  });

  it('CP-06 un pasajero no accede a las rutas del personal', async () => {
    const t = await tokenDe('pasajero');
    for (const ruta of ['/api/pilotos', '/api/buses', '/api/reportes/estaciones', '/api/dashboard']) {
      expect((await api().get(ruta).set(auth(t))).status).toBe(403);
    }
  });

  it('CP-07 las contraseñas se guardan como hash bcrypt', async () => {
    const usuarios: any[] = await Usuario.findAll({ raw: true });
    expect(usuarios.length).toBeGreaterThan(0);
    for (const u of usuarios) expect(u.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('CP-08 una cuenta desactivada pierde acceso de inmediato', async () => {
    const t = await tokenDe('guardia');
    expect((await api().get('/api/auth/me').set(auth(t))).status).toBe(200);
    await Usuario.update({ activo: false }, { where: { email: CUENTAS.guardia[0] } });
    expect((await api().get('/api/auth/me').set(auth(t))).status).toBe(401);
    await Usuario.update({ activo: true }, { where: { email: CUENTAS.guardia[0] } });
  });

  it('CP-09 valida los datos de entrada y lista los campos inválidos', async () => {
    const r = await api().post('/api/auth/login').send({ email: 'no-es-correo', password: '' });
    expect(r.status).toBe(400);
    expect(Array.isArray(r.body.details)).toBe(true);
    expect(r.body.details.length).toBeGreaterThan(0);
  });

  it('el registro público solo crea pasajeros, aunque se pida otro rol', async () => {
    const r = await api().post('/api/auth/registro').send({ nombre: 'Intruso', email: 'intruso@correo.com', password: 'Clave12345', rol: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body.usuario.rol).toBe('pasajero');
  });
});
