import { z } from 'zod';
import { Estacion, HorarioEstacion, HorarioLinea, Linea, sequelize } from '../db.js';
import { notFound } from '../lib/http.js';

export const DIAS = ['LUNES_VIERNES', 'SABADO', 'DOMINGO_FESTIVOS'] as const;
export type Dia = (typeof DIAS)[number];
export type Franja = { inicio: string; fin: string } | null;
export type Horarios = Record<Dia, Franja>;

export const horariosVacios = (): Horarios => ({ LUNES_VIERNES: null, SABADO: null, DOMINGO_FESTIVOS: null });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:MM de 00:00 a 23:59');
const franja = z
  .object({ inicio: hhmm, fin: hhmm })
  .refine((f) => f.inicio < f.fin, { message: 'La hora de fin debe ser posterior a la de inicio' })
  .nullable();

// null = sin servicio ese día
export const horariosSchema = z.object({ LUNES_VIERNES: franja, SABADO: franja, DOMINGO_FESTIVOS: franja });

function armar(filas: any[], clave: string) {
  const m: Record<number, Horarios> = {};
  for (const f of filas) (m[f[clave]] ??= horariosVacios())[f.tipo_dia as Dia] = { inicio: f.hora_inicio, fin: f.hora_fin };
  return m;
}

export async function leerHorarios() {
  const [lineas, estaciones] = await Promise.all([HorarioLinea.findAll({ raw: true }), HorarioEstacion.findAll({ raw: true })]);
  return { lineas: armar(lineas, 'id_linea'), estaciones: armar(estaciones, 'id_estacion') };
}

// Listado completo para el panel de administración
export async function listarParaAdmin() {
  const [h, lineas, estaciones]: any[] = await Promise.all([
    leerHorarios(),
    Linea.findAll({ attributes: ['id_linea', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
    Estacion.findAll({ attributes: ['id_estacion', 'nombre'], include: [{ association: 'municipalidad', attributes: ['nombre'] }], order: [['nombre', 'ASC']] }),
  ]);
  return {
    lineas: lineas.map((l: any) => ({ ...l, horarios: h.lineas[l.id_linea] ?? horariosVacios() })),
    estaciones: estaciones.map((e: any) => ({ id_estacion: e.id_estacion, nombre: e.nombre, municipalidad: e.municipalidad?.nombre, horarios: h.estaciones[e.id_estacion] ?? horariosVacios() })),
  };
}

async function guardar(modelo: any, clave: 'id_linea' | 'id_estacion', id: number, horarios: Horarios) {
  await sequelize.transaction(async (t) => {
    await modelo.destroy({ where: { [clave]: id }, transaction: t });
    const filas = DIAS.filter((d) => horarios[d]).map((d) => ({ [clave]: id, tipo_dia: d, hora_inicio: horarios[d]!.inicio, hora_fin: horarios[d]!.fin }));
    if (filas.length) await modelo.bulkCreate(filas, { transaction: t });
  });
  return horarios;
}

export async function guardarHorarioLinea(id: number, horarios: Horarios) {
  if (!(await Linea.findByPk(id))) throw notFound('Línea no encontrada');
  return guardar(HorarioLinea, 'id_linea', id, horarios);
}

export async function guardarHorarioEstacion(id: number, horarios: Horarios) {
  if (!(await Estacion.findByPk(id))) throw notFound('Estación no encontrada');
  return guardar(HorarioEstacion, 'id_estacion', id, horarios);
}
