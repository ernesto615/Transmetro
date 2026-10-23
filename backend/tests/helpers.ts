import request from 'supertest';
import { app } from '../src/app.js';

export const api = () => request(app);

export const CUENTAS = {
  admin: ['admin@transmetro.gt', 'Admin123!'],
  municipal: ['municipal@transmetro.gt', 'Muni12345!'],
  operador: ['operador@transmetro.gt', 'Oper12345!'],
  guardia: ['guardia@transmetro.gt', 'Guardia123!'],
  pasajero: ['pasajero@transmetro.gt', 'Pasajero123!'],
} as const;

export async function tokenDe(rol: keyof typeof CUENTAS): Promise<string> {
  const [email, password] = CUENTAS[rol];
  const r = await api().post('/api/auth/login').send({ email, password });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${rol}: ${r.status}`);
  return r.body.token;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// IDs del seed: líneas 1-3, estaciones 1-8 (1 = Centra Norte, 3 = Plaza Barrios, 4 = Trébol, 8 = Villa Nueva Centro),
// buses 1-5 línea 1 (bus 1 = 120 pasajeros), 6-9 línea 2, 10-12 línea 3, 13-14 sin línea, parqueos 1-3.
