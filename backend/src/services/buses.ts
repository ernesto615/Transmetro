import type { Transaction } from 'sequelize';
import { Bus, Linea, Parqueo, LineaEstacion, AuditoriaBus, sequelize } from '../db.js';
import { bad, conflict, notFound } from '../lib/http.js';
import { limitesBuses } from './lineas.js';
import { emitir } from '../realtime.js';

// Verifica que sumar un bus a la línea no supere el doble de sus estaciones.
async function validarCupo(idLinea: number, excluirBus: number | null, t: Transaction) {
  const linea = await Linea.findByPk(idLinea, { transaction: t, lock: t.LOCK.UPDATE });
  if (!linea) throw bad('La línea indicada no existe');
  const n = await LineaEstacion.count({ where: { id_linea: idLinea }, transaction: t });
  if (n === 0) throw conflict('La línea no tiene estaciones; defina su recorrido antes de asignarle buses');
  const buses = (await Bus.findAll({ where: { id_linea: idLinea }, attributes: ['id_bus'], transaction: t, raw: true })) as any[];
  const actuales = buses.filter((b) => b.id_bus !== excluirBus).length;
  const { max } = limitesBuses(n);
  if (actuales + 1 > max) throw conflict(`La línea ya tiene el máximo de buses permitido (${max} = 2 × ${n} estaciones)`);
}

// Impide que, al sacar un bus de una línea que hoy cumple, ésta quede por debajo del mínimo.
async function validarSalida(idLinea: number, t: Transaction) {
  const n = await LineaEstacion.count({ where: { id_linea: idLinea }, transaction: t });
  const actuales = await Bus.count({ where: { id_linea: idLinea }, transaction: t });
  if (n > 0 && actuales === limitesBuses(n).min)
    throw conflict(`La línea quedaría con menos buses que estaciones (mínimo ${n}). Asigne otro bus antes de retirar éste`);
}

export interface BusInput {
  placa: string;
  capacidad_maxima: number;
  id_parqueo: number;
  id_linea?: number | null;
}

export async function crearBus(data: BusInput, idUsuario: number | null) {
  return sequelize.transaction(async (t) => {
    if (!(await Parqueo.findByPk(data.id_parqueo, { transaction: t }))) throw bad('El parqueo indicado no existe');
    if (data.id_linea) await validarCupo(data.id_linea, null, t);
    const bus: any = await Bus.create({ ...data, id_linea: data.id_linea ?? null }, { transaction: t });
    await AuditoriaBus.create(
      { id_bus: bus.id_bus, id_linea_nueva: bus.id_linea, id_parqueo_nuevo: bus.id_parqueo, id_usuario: idUsuario },
      { transaction: t },
    );
    return bus;
  });
}

export async function asignarLinea(idBus: number, idLinea: number | null, idUsuario: number | null) {
  return sequelize.transaction(async (t) => {
    const bus: any = await Bus.findByPk(idBus, { transaction: t, lock: t.LOCK.UPDATE });
    if (!bus) throw notFound('Bus no encontrado');
    if (bus.id_linea === idLinea) return bus;
    if (bus.id_linea) await validarSalida(bus.id_linea, t);
    if (idLinea) await validarCupo(idLinea, bus.id_bus, t);
    const anterior = bus.id_linea;
    await bus.update({ id_linea: idLinea }, { transaction: t });
    await AuditoriaBus.create(
      { id_bus: idBus, id_linea_anterior: anterior, id_linea_nueva: idLinea, id_usuario: idUsuario },
      { transaction: t },
    );
    return bus;
  });
}

// Un bus puede cambiar de parqueo, pero nunca quedar sin él (idParqueo es obligatorio).
export async function cambiarParqueo(idBus: number, idParqueo: number, idUsuario: number | null) {
  return sequelize.transaction(async (t) => {
    const bus: any = await Bus.findByPk(idBus, { transaction: t, lock: t.LOCK.UPDATE });
    if (!bus) throw notFound('Bus no encontrado');
    if (!(await Parqueo.findByPk(idParqueo, { transaction: t }))) throw bad('El parqueo indicado no existe');
    const anterior = bus.id_parqueo;
    await bus.update({ id_parqueo: idParqueo }, { transaction: t });
    await AuditoriaBus.create(
      { id_bus: idBus, id_parqueo_anterior: anterior, id_parqueo_nuevo: idParqueo, id_usuario: idUsuario },
      { transaction: t },
    );
    return bus;
  });
}

// Ingesta de posición GPS/AVL (RF-5): guarda la última posición y la difunde en tiempo real.
export async function registrarPosicion(idBus: number, latitud: number, longitud: number) {
  const bus: any = await Bus.findByPk(idBus, { include: [{ association: 'linea', attributes: ['id_linea', 'nombre'] }] });
  if (!bus) throw notFound('Bus no encontrado');
  const ahora = new Date();
  await bus.update({ latitud, longitud, ultima_posicion: ahora });
  emitir('bus:posicion', {
    id_bus: bus.id_bus,
    placa: bus.placa,
    id_linea: bus.id_linea,
    linea: bus.linea?.nombre ?? null,
    latitud,
    longitud,
    ultima_posicion: ahora,
  });
  return { ok: true, ultima_posicion: ahora };
}
