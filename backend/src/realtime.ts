import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { Usuario } from './db.js';

let io: Server | null = null;

export function initRealtime(http: HttpServer) {
  io = new Server(http, { cors: { origin: env.CORS_ORIGIN } });
  // Valida el token y deja entrar al personal a la sala 'personal'; un pasajero nunca recibe alertas ni pánico.
  io.use(async (socket, next) => {
    try {
      const { sub } = jwt.verify(String(socket.handshake.auth?.token ?? ''), env.JWT_SECRET) as any;
      const u: any = await Usuario.findByPk(Number(sub));
      if (!u || !u.activo) throw new Error('inactivo');
      if (u.rol !== 'pasajero') socket.join('personal');
      next();
    } catch {
      next(new Error('No autorizado'));
    }
  });
  return io;
}

// Eventos: 'bus:posicion', 'alerta', 'panico'
export const emitir = (evento: string, payload: unknown) => io?.to('personal').emit(evento, payload);
