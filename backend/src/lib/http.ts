import type { ErrorRequestHandler, Request } from 'express';
import { ZodError } from 'zod';
import { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } from 'sequelize';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const bad = (m: string, d?: unknown) => new AppError(400, m, d);
export const notFound = (m = 'No encontrado') => new AppError(404, m);
export const conflict = (m: string, d?: unknown) => new AppError(409, m, d);
export const forbidden = (m = 'No tiene permiso para esta acción') => new AppError(403, m);

export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Parámetro ${name} inválido`);
  return n;
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof UniqueConstraintError) return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  if (err instanceof ForeignKeyConstraintError)
    return res.status(409).json({ error: 'El registro está relacionado con otros datos o referencia algo que no existe' });
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
