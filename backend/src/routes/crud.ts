import { Router, type Request } from 'express';
import type { ModelStatic, Model, Includeable, Order, WhereOptions } from 'sequelize';
import type { ZodObject, ZodRawShape } from 'zod';
import { requireRole, type Rol } from '../middleware/auth.js';
import { idParam, notFound } from '../lib/http.js';

interface CrudOptions {
  pk: string;
  schema: ZodObject<ZodRawShape>;
  include?: Includeable[];
  order?: Order;
  scope?: (req: Request) => WhereOptions;
  writeRoles?: Rol[];
}

// CRUD genérico: lectura para cualquier usuario autenticado, escritura restringida por rol.
export function crud(model: ModelStatic<Model<any, any>>, o: CrudOptions) {
  const r = Router();
  const write = requireRole(...(o.writeRoles ?? ['admin']));

  r.get('/', async (req, res) => {
    res.json(await model.findAll({ where: o.scope?.(req) ?? {}, include: o.include, order: o.order }));
  });
  r.get('/:id', async (req, res) => {
    const row = await model.findByPk(idParam(req), { include: o.include });
    if (!row) throw notFound();
    res.json(row);
  });
  r.post('/', write, async (req, res) => {
    res.status(201).json(await model.create(o.schema.parse(req.body) as any));
  });
  r.patch('/:id', write, async (req, res) => {
    const row = await model.findByPk(idParam(req));
    if (!row) throw notFound();
    res.json(await row.update(o.schema.partial().parse(req.body) as any));
  });
  r.delete('/:id', write, async (req, res) => {
    const row = await model.findByPk(idParam(req));
    if (!row) throw notFound();
    await row.destroy();
    res.status(204).end();
  });
  return r;
}
