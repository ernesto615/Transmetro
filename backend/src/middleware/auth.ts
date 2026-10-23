import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Usuario } from '../db.js';
import { AppError, forbidden } from '../lib/http.js';

export type Rol = 'admin' | 'municipal' | 'operador' | 'guardia' | 'pasajero';
export const PERSONAL: Rol[] = ['admin', 'municipal', 'operador', 'guardia'];
export interface AuthUser {
  id: number;
  nombre: string;
  rol: Rol;
  idEstacion: number | null;
  idMunicipalidad: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (id: number) => jwt.sign({ sub: id }, env.JWT_SECRET, { expiresIn: '12h' });

// Valida el token y recarga el usuario desde la BD en cada petición:
// un cambio de rol o una cuenta desactivada surten efecto de inmediato.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Falta el token de autenticación');
  let sub: number;
  try {
    sub = Number((jwt.verify(token, env.JWT_SECRET) as any).sub);
  } catch {
    throw new AppError(401, 'Sesión inválida o expirada');
  }
  const u: any = await Usuario.findByPk(sub);
  if (!u || !u.activo) throw new AppError(401, 'Cuenta inexistente o desactivada');
  req.user = {
    id: u.id_usuario,
    nombre: u.nombre,
    rol: u.rol,
    idEstacion: u.id_estacion,
    idMunicipalidad: u.id_municipalidad,
  };
  next();
};

export const requireRole =
  (...roles: Rol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) throw forbidden();
    next();
  };
