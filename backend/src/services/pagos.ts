import { LineaEstacion, TarjetaAcceso, Transaccion, sequelize } from '../db.js';
import { bad, conflict, notFound } from '../lib/http.js';

export const TARIFA_BASE = 1.0;

export interface CobroInput {
  numero_tarjeta: string;
  id_estacion: number;
  id_linea?: number; // opcional: si la estación tiene varias líneas, indica en cuál abordó
  monto?: number;
  referencia?: string; // idempotencia: reintentos/sincronización offline no cobran dos veces
}

// Descontar saldo y registrar la transacción ocurren juntos o no ocurren (ACID).
export async function cobrar(d: CobroInput) {
  return sequelize.transaction(async (t) => {
    if (d.referencia) {
      const previa = await Transaccion.findOne({ where: { referencia: d.referencia }, transaction: t });
      if (previa) return { duplicada: true, transaccion: previa.toJSON() };
    }
    const tarjeta: any = await TarjetaAcceso.findOne({ where: { numero: d.numero_tarjeta }, transaction: t, lock: t.LOCK.UPDATE });
    if (!tarjeta) throw notFound('Tarjeta no registrada');
    // La línea alimenta el análisis de demanda: si no se indica y la estación tiene una sola línea, se deduce.
    const lineasDeEstacion = (await LineaEstacion.findAll({ where: { id_estacion: d.id_estacion }, attributes: ['id_linea'], raw: true, transaction: t })) as any[];
    let idLinea: number | null = d.id_linea ?? null;
    if (idLinea !== null) {
      if (!lineasDeEstacion.some((l) => l.id_linea === idLinea)) throw bad('La estación no pertenece a esa línea');
    } else if (lineasDeEstacion.length === 1) idLinea = lineasDeEstacion[0].id_linea;
    const monto = d.monto ?? TARIFA_BASE;
    if (Number(tarjeta.saldo) < monto) throw conflict(`Saldo insuficiente (saldo Q${Number(tarjeta.saldo).toFixed(2)}, tarifa Q${monto.toFixed(2)})`);
    await tarjeta.update({ saldo: (Number(tarjeta.saldo) - monto).toFixed(2) }, { transaction: t });
    const tx: any = await Transaccion.create(
      { id_tarjeta: tarjeta.id_tarjeta, id_estacion: d.id_estacion, id_linea: idLinea, monto, medio_pago: 'TARJETA', referencia: d.referencia ?? null },
      { transaction: t },
    );
    return { duplicada: false, transaccion: tx.toJSON(), saldo: Number(tarjeta.saldo) };
  });
}

export async function recargar(numero: string, id_estacion: number | null, monto: number, referencia?: string, medio = 'RECARGA') {
  return sequelize.transaction(async (t) => {
    if (referencia) {
      const previa = await Transaccion.findOne({ where: { referencia }, transaction: t });
      if (previa) return { duplicada: true, transaccion: previa.toJSON() };
    }
    const tarjeta: any = await TarjetaAcceso.findOne({ where: { numero }, transaction: t, lock: t.LOCK.UPDATE });
    if (!tarjeta) throw notFound('Tarjeta no registrada');
    await tarjeta.update({ saldo: (Number(tarjeta.saldo) + monto).toFixed(2) }, { transaction: t });
    const tx: any = await Transaccion.create(
      { id_tarjeta: tarjeta.id_tarjeta, id_estacion, monto, medio_pago: medio, referencia: referencia ?? null },
      { transaction: t },
    );
    return { duplicada: false, transaccion: tx.toJSON(), saldo: Number(tarjeta.saldo) };
  });
}

// Historial de una tarjeta: cuándo y dónde se pagó o recargó (más reciente primero).
export async function historialTarjeta(numero: string, idUsuario?: number) {
  const tarjeta: any = await TarjetaAcceso.findOne({ where: { numero } });
  if (!tarjeta || (idUsuario !== undefined && tarjeta.id_usuario !== idUsuario)) throw notFound('Tarjeta no encontrada');
  const movimientos = await Transaccion.findAll({
    where: { id_tarjeta: tarjeta.id_tarjeta },
    include: [{ association: 'estacion', attributes: ['nombre'] }],
    order: [['fecha_hora', 'DESC']],
    limit: 100,
  });
  const ultimoUso: any = movimientos.find((m: any) => m.medio_pago === 'TARJETA');
  return {
    tarjeta: { numero: tarjeta.numero, saldo: Number(tarjeta.saldo) },
    ultimo_uso: ultimoUso ? { fecha_hora: ultimoUso.fecha_hora, estacion: ultimoUso.estacion?.nombre ?? null } : null,
    movimientos,
  };
}
