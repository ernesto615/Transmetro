import type { Transaction } from 'sequelize';
import { Linea, LineaEstacion, Estacion, Bus, sequelize } from '../db.js';
import { bad, notFound } from '../lib/http.js';

// Regla de negocio: entre N y 2N buses, siendo N el número de estaciones de la línea.
export const limitesBuses = (numEstaciones: number) => ({ min: numEstaciones, max: numEstaciones * 2 });

export async function cumplimiento(idLinea: number, t?: Transaction) {
  const linea = await Linea.findByPk(idLinea, { transaction: t });
  if (!linea) throw notFound('Línea no encontrada');
  const estaciones = await LineaEstacion.count({ where: { id_linea: idLinea }, transaction: t });
  const buses = await Bus.count({ where: { id_linea: idLinea }, transaction: t });
  const { min, max } = limitesBuses(estaciones);
  return { id_linea: idLinea, estaciones, buses, min, max, cumple: estaciones > 0 && buses >= min && buses <= max };
}

export interface ParadaInput {
  id_estacion: number;
  distancia_a_siguiente_km: number;
}

// Reemplaza el recorrido completo: el orden es el de la lista y la distancia total se recalcula.
export async function reemplazarParadas(idLinea: number, paradas: ParadaInput[]) {
  const ids = paradas.map((p) => p.id_estacion);
  if (new Set(ids).size !== ids.length) throw bad('Una estación no puede repetirse dentro de la misma línea');

  return sequelize.transaction(async (t) => {
    const linea: any = await Linea.findByPk(idLinea, { transaction: t, lock: t.LOCK.UPDATE });
    if (!linea) throw notFound('Línea no encontrada');
    const existentes = await Estacion.count({ where: { id_estacion: ids }, transaction: t });
    if (existentes !== ids.length) throw bad('Alguna de las estaciones indicadas no existe');

    const busesActuales = await Bus.count({ where: { id_linea: idLinea }, transaction: t });
    if (paradas.length > 0 && busesActuales > paradas.length * 2)
      throw bad(`Con ${paradas.length} estaciones la línea admite máximo ${paradas.length * 2} buses y hoy tiene ${busesActuales}. Reasigne buses primero.`);

    await LineaEstacion.destroy({ where: { id_linea: idLinea }, transaction: t });
    await LineaEstacion.bulkCreate(
      paradas.map((p, i) => ({
        id_linea: idLinea,
        id_estacion: p.id_estacion,
        orden: i + 1,
        // la última estación no tiene "siguiente"
        distancia_a_siguiente_km: i === paradas.length - 1 ? 0 : p.distancia_a_siguiente_km,
      })),
      { transaction: t },
    );
    const total = paradas.slice(0, -1).reduce((s, p) => s + Number(p.distancia_a_siguiente_km), 0);
    await linea.update({ distancia_total_km: total.toFixed(2) }, { transaction: t });
    return obtenerLinea(idLinea, t);
  });
}

export async function obtenerLinea(idLinea: number, t?: Transaction) {
  const linea = await Linea.findByPk(idLinea, {
    transaction: t,
    include: [
      { association: 'municipalidad' },
      { association: 'paradas', include: [{ association: 'estacion', include: [{ association: 'lineas', attributes: ['id_linea'] }] }] },
      { association: 'buses', include: [{ association: 'parqueo' }, { association: 'pilotos' }] },
    ],
    order: [[{ model: LineaEstacion, as: 'paradas' }, 'orden', 'ASC']],
  });
  if (!linea) throw notFound('Línea no encontrada');
  return { ...(linea.toJSON() as any), cumplimiento: await cumplimiento(idLinea, t) };
}

// Distancia entre dos estaciones: suma de tramos si comparten línea; si no, línea recta (Haversine).
export async function distanciaEntre(desde: number, hasta: number) {
  if (desde === hasta) return { km: 0, metodo: 'misma estación' };
  const filas: any[] = await LineaEstacion.findAll({ where: { id_estacion: [desde, hasta] }, raw: true });
  const porLinea = new Map<number, any[]>();
  for (const f of filas) porLinea.set(f.id_linea, [...(porLinea.get(f.id_linea) ?? []), f]);
  for (const [idLinea, par] of porLinea) {
    if (par.length !== 2) continue;
    const [a, b] = par.sort((x, y) => x.orden - y.orden);
    const tramos: any[] = await LineaEstacion.findAll({ where: { id_linea: idLinea }, raw: true });
    const km = tramos
      .filter((t) => t.orden >= a.orden && t.orden < b.orden)
      .reduce((s, t) => s + Number(t.distancia_a_siguiente_km), 0);
    return { km: Number(km.toFixed(2)), metodo: 'recorrido de la línea', id_linea: idLinea };
  }
  const [e1, e2]: any[] = await Promise.all([Estacion.findByPk(desde), Estacion.findByPk(hasta)]);
  if (!e1 || !e2) throw notFound('Estación no encontrada');
  if (e1.latitud == null || e2.latitud == null) throw bad('Las estaciones no comparten línea ni tienen coordenadas');
  return { km: haversineKm(Number(e1.latitud), Number(e1.longitud), Number(e2.latitud), Number(e2.longitud)), metodo: 'línea recta (coordenadas)' };
}

// Distancia en línea recta sobre la esfera terrestre, en km con dos decimales.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(h))).toFixed(2));
}
