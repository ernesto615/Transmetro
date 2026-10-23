import type { RequestHandler } from 'express';
import { AppError } from '../lib/http.js';

// Limitador sencillo por IP (en memoria) para rutas públicas: frena la fuerza bruta y el abuso.
// En producción con varias instancias conviene un almacén compartido (p. ej. Redis).
export const limitar = (max: number, ventanaMs: number): RequestHandler => {
  const golpes = new Map<string, number[]>();
  return (req, _res, next) => {
    if (process.env.NODE_ENV === 'test') return next(); // las pruebas automáticas hacen muchas peticiones
    const ip = req.ip ?? 'desconocida';
    const ahora = Date.now();
    const recientes = (golpes.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);
    if (recientes.length >= max) throw new AppError(429, 'Demasiados intentos. Espere unos minutos e intente de nuevo.');
    recientes.push(ahora);
    golpes.set(ip, recientes);
    if (golpes.size > 5000) for (const [k, v] of golpes) if (v.every((t) => ahora - t >= ventanaMs)) golpes.delete(k);
    next();
  };
};
