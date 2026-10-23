import { QueryTypes } from 'sequelize';
import { MovimientoFinanciero, sequelize } from '../db.js';

const TZ = 'America/Guatemala';

export const CATEGORIAS_EGRESO = ['Combustible', 'Salarios y personal', 'Mantenimiento de flota', 'Seguros', 'Tecnología y nube', 'Administración', 'Otros egresos'];
export const CATEGORIAS_INGRESO = ['Subsidio municipal', 'Publicidad en estaciones', 'Otros ingresos'];

const q = (sql: string, replacements: Record<string, unknown>) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<any[]>;

// Primer día del mes de hace (meses - 1) meses, en hora de Guatemala.
export async function desdeFecha(meses: number): Promise<string> {
  const [r] = await q(`SELECT to_char((date_trunc('month', now() AT TIME ZONE :tz) - ((:n - 1) * interval '1 month'))::date, 'YYYY-MM-DD') AS desde`, { tz: TZ, n: meses });
  return r.desde;
}

// Cálculo puro: de los totales mensuales a flujo neto y acumulado.
export function armarFlujo(filas: { mes: string; entradas_recargas: number; entradas_otras: number; salidas: number; ingreso_pasajes: number; pasajes: number }[]) {
  let acumulado = 0;
  return filas.map((f) => {
    const entradas = f.entradas_recargas + f.entradas_otras;
    const neto = entradas - f.salidas;
    acumulado += neto;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return { ...f, entradas: r2(entradas), neto: r2(neto), acumulado: r2(acumulado) };
  });
}

export async function resumenFinanciero(meses: number) {
  const [mensual, egresos, ingresos, pasivo] = await Promise.all([
    q(`WITH meses AS (
         SELECT generate_series(date_trunc('month', now() AT TIME ZONE :tz) - ((:n - 1) * interval '1 month'),
                                date_trunc('month', now() AT TIME ZONE :tz), interval '1 month') AS mes),
       tx AS (
         SELECT date_trunc('month', fecha_hora AT TIME ZONE :tz) AS mes,
                SUM(CASE WHEN medio_pago LIKE 'RECARGA%' THEN monto ELSE 0 END) AS recargas,
                SUM(CASE WHEN medio_pago = 'TARJETA' THEN monto ELSE 0 END) AS pasajes_monto,
                COUNT(*) FILTER (WHERE medio_pago = 'TARJETA') AS pasajes
         FROM transaccion GROUP BY 1),
       mv AS (
         SELECT date_trunc('month', fecha::timestamp) AS mes,
                SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE 0 END) AS otros_ingresos,
                SUM(CASE WHEN tipo = 'EGRESO' THEN monto ELSE 0 END) AS egresos
         FROM movimiento_financiero GROUP BY 1)
       SELECT to_char(m.mes, 'YYYY-MM') AS mes,
              COALESCE(tx.recargas, 0)::float AS entradas_recargas,
              COALESCE(mv.otros_ingresos, 0)::float AS entradas_otras,
              COALESCE(mv.egresos, 0)::float AS salidas,
              COALESCE(tx.pasajes_monto, 0)::float AS ingreso_pasajes,
              COALESCE(tx.pasajes, 0)::int AS pasajes
       FROM meses m LEFT JOIN tx ON tx.mes = m.mes LEFT JOIN mv ON mv.mes = m.mes ORDER BY m.mes`, { tz: TZ, n: meses }),
    q(`SELECT categoria, SUM(monto)::float AS total FROM movimiento_financiero
       WHERE tipo = 'EGRESO' AND fecha >= (date_trunc('month', now() AT TIME ZONE :tz) - ((:n - 1) * interval '1 month'))::date
       GROUP BY categoria ORDER BY total DESC`, { tz: TZ, n: meses }),
    q(`SELECT categoria, SUM(monto)::float AS total FROM movimiento_financiero
       WHERE tipo = 'INGRESO' AND fecha >= (date_trunc('month', now() AT TIME ZONE :tz) - ((:n - 1) * interval '1 month'))::date
       GROUP BY categoria ORDER BY total DESC`, { tz: TZ, n: meses }),
    q(`SELECT COALESCE(SUM(saldo), 0)::float AS pasivo FROM tarjeta_acceso`, {}),
  ]);

  const flujo = armarFlujo(mensual);
  const suma = (k: 'entradas_recargas' | 'entradas_otras' | 'salidas' | 'ingreso_pasajes' | 'pasajes') => flujo.reduce((s, f) => s + f[k], 0);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const entradas = suma('entradas_recargas') + suma('entradas_otras');
  const salidas = suma('salidas');
  const pasajes = suma('pasajes');
  const ingresoPasajes = suma('ingreso_pasajes');
  return {
    meses,
    kpis: {
      entradas: r2(entradas),
      entradas_recargas: r2(suma('entradas_recargas')),
      entradas_otras: r2(suma('entradas_otras')),
      salidas: r2(salidas),
      flujo_neto: r2(entradas - salidas),
      ingreso_pasajes: r2(ingresoPasajes),
      pasajes,
      // recuperación de costos: qué parte de los gastos paga el pasaje por sí solo
      cobertura_costos_pct: salidas > 0 ? r2((ingresoPasajes / salidas) * 100) : null,
      costo_por_pasajero: pasajes > 0 ? r2(salidas / pasajes) : null,
      // dinero recibido por recargas que aún no se ha consumido en pasajes
      pasivo_prepago: r2(pasivo[0].pasivo),
    },
    mensual: flujo,
    egresos_por_categoria: egresos,
    ingresos_por_categoria: ingresos,
  };
}

export async function listarMovimientos(meses: number) {
  const desde = await desdeFecha(meses);
  return MovimientoFinanciero.findAll({
    where: sequelize.where(sequelize.col('fecha'), '>=', desde),
    include: [{ association: 'linea', attributes: ['nombre'] }],
    order: [['fecha', 'DESC'], ['id_movimiento', 'DESC']],
    limit: 500,
  });
}
