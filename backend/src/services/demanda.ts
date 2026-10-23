import { QueryTypes } from 'sequelize';
import { Alerta, sequelize } from '../db.js';
import { emitir } from '../realtime.js';

const TZ = 'America/Guatemala';

// Umbrales del análisis (fáciles de ajustar y de explicar)
export const PASAJES_MINIMOS = 50;     // con menos pasajes no hay datos suficientes para opinar
export const INDICE_CRITICO = 1.5;     // carga por bus 1.5 veces mayor al promedio de la red
export const INDICE_ALTO = 1.25;
export const INDICE_BAJO = 0.5;
export const SOBRECUPOS_CRITICO = 5;   // alertas de sobrecupo en 7 días
export const SOBRECUPOS_ALTO = 2;
export const CRECIMIENTO_NOTABLE_PCT = 20;

export interface LineaDemanda {
  id_linea: number; nombre: string; estaciones: number; buses: number; capacidad: number;
  pasajes: number; pasajes_anterior: number; sobrecupos_7d: number;
}
export type Nivel = 'CRITICA' | 'ALTA' | 'NORMAL' | 'BAJA' | 'SIN_DATOS';

// Cálculo puro (sin base de datos). La carga se mide en pasajes por bus por día y se compara con el promedio de toda la red.
export function evaluarLineas(lineas: LineaDemanda[], dias: number) {
  const totalPasajes = lineas.reduce((s, l) => s + l.pasajes, 0);
  const busesConLinea = lineas.reduce((s, l) => s + l.buses, 0);
  const cargaRed = busesConLinea > 0 ? totalPasajes / dias / busesConLinea : 0;

  const detalle = lineas.map((l) => {
    const min = l.estaciones, max = l.estaciones * 2;
    const pasajesDia = l.pasajes / dias;
    const carga = l.buses > 0 ? pasajesDia / l.buses : 0;
    const indice = cargaRed > 0 ? carga / cargaRed : 0;
    const crecimiento = l.pasajes_anterior > 0 ? ((l.pasajes - l.pasajes_anterior) / l.pasajes_anterior) * 100 : null;

    let nivel: Nivel = 'NORMAL';
    if (l.pasajes < PASAJES_MINIMOS || cargaRed === 0) nivel = 'SIN_DATOS';
    else if (l.sobrecupos_7d >= SOBRECUPOS_CRITICO || indice >= INDICE_CRITICO) nivel = 'CRITICA';
    else if (l.sobrecupos_7d >= SOBRECUPOS_ALTO || indice >= INDICE_ALTO) nivel = 'ALTA';
    else if (indice <= INDICE_BAJO && l.buses > min) nivel = 'BAJA';

    // Buses necesarios para llevar la línea a la carga promedio de la red
    const necesarios = cargaRed > 0 ? Math.ceil(pasajesDia / cargaRed) : l.buses;
    let accion: 'AGREGAR_BUSES' | 'NUEVA_LINEA_O_EXPRESO' | 'REASIGNAR_BUSES' | 'NINGUNA' = 'NINGUNA';
    let busesAgregar = 0, busesLiberables = 0, necesitaLineaNueva = false;

    if (nivel === 'CRITICA' || nivel === 'ALTA') {
      const extra = Math.max(1, necesarios - l.buses);
      const posibles = Math.max(0, max - l.buses); // una línea admite como máximo el doble de buses que estaciones
      busesAgregar = Math.min(extra, posibles);
      necesitaLineaNueva = extra > posibles;
      accion = busesAgregar > 0 ? 'AGREGAR_BUSES' : 'NUEVA_LINEA_O_EXPRESO';
    } else if (nivel === 'BAJA') {
      const sobrantes = l.buses - Math.max(min, necesarios);
      busesLiberables = Math.max(0, Math.min(sobrantes, l.buses - min));
      accion = busesLiberables > 0 ? 'REASIGNAR_BUSES' : 'NINGUNA';
    }

    const r1 = (x: number) => Math.round(x * 10) / 10;
    return {
      ...l, minimo: min, maximo: max,
      pasajes_dia: r1(pasajesDia), carga_por_bus: r1(carga), indice_vs_red: Math.round(indice * 100) / 100,
      participacion_pct: totalPasajes > 0 ? r1((l.pasajes / totalPasajes) * 100) : 0,
      crecimiento_pct: crecimiento === null ? null : r1(crecimiento),
      nivel, accion, buses_a_agregar: busesAgregar, buses_liberables: busesLiberables, necesita_linea_nueva: necesitaLineaNueva,
    };
  });

  const ranking = [...detalle].sort((a, b) => b.pasajes - a.pasajes);
  return {
    total_pasajes: totalPasajes,
    carga_promedio_red: Math.round(cargaRed * 10) / 10,
    lineas: ranking,
    resumen: {
      criticas: detalle.filter((l) => l.nivel === 'CRITICA').length,
      altas: detalle.filter((l) => l.nivel === 'ALTA').length,
      bajas: detalle.filter((l) => l.nivel === 'BAJA').length,
    },
  };
}

// Texto de la recomendación para mostrar y notificar
export function textoRecomendacion(l: ReturnType<typeof evaluarLineas>['lineas'][number]) {
  const crece = l.crecimiento_pct !== null && l.crecimiento_pct >= CRECIMIENTO_NOTABLE_PCT ? ` La demanda creció ${l.crecimiento_pct} % frente al período anterior.` : '';
  if (l.nivel === 'CRITICA' || l.nivel === 'ALTA') {
    const base = l.nivel === 'CRITICA' ? 'Demanda crítica' : 'Demanda alta';
    const sobre = l.sobrecupos_7d > 0 ? ` ${l.sobrecupos_7d} alertas de sobrecupo en 7 días.` : '';
    if (l.accion === 'AGREGAR_BUSES') {
      const nueva = l.necesita_linea_nueva ? ` Aun así quedaría corta: la línea tendría su máximo (${l.maximo} buses); evaluar también una línea nueva o un servicio expreso.` : '';
      return `${l.nombre}: ${base}.${sobre}${crece} Agregar ${l.buses_a_agregar} ${l.buses_a_agregar === 1 ? 'bus' : 'buses'}.${nueva}`;
    }
    return `${l.nombre}: ${base}.${sobre}${crece} La línea ya tiene su máximo de buses (${l.maximo}); evaluar una línea nueva o un servicio expreso.`;
  }
  if (l.nivel === 'BAJA' && l.accion === 'REASIGNAR_BUSES') {
    return `${l.nombre}: baja demanda (${l.indice_vs_red} veces el promedio de la red). Se pueden reasignar ${l.buses_liberables} ${l.buses_liberables === 1 ? 'bus' : 'buses'} sin bajar del mínimo (${l.minimo}).`;
  }
  return '';
}

const q = (sql: string, replacements: Record<string, unknown>) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<any[]>;

export async function analizarDemanda(dias = 30) {
  const [lineas, serie, estaciones, porLineaEstacion] = await Promise.all([
    q(`SELECT l.id_linea, l.nombre,
         (SELECT COUNT(*) FROM linea_estacion le WHERE le.id_linea = l.id_linea)::int AS estaciones,
         (SELECT COUNT(*) FROM bus b WHERE b.id_linea = l.id_linea)::int AS buses,
         (SELECT COALESCE(SUM(b.capacidad_maxima), 0) FROM bus b WHERE b.id_linea = l.id_linea)::int AS capacidad,
         (SELECT COUNT(*) FROM transaccion t WHERE t.id_linea = l.id_linea AND t.medio_pago = 'TARJETA'
            AND t.fecha_hora >= now() - (:d * interval '1 day'))::int AS pasajes,
         (SELECT COUNT(*) FROM transaccion t WHERE t.id_linea = l.id_linea AND t.medio_pago = 'TARJETA'
            AND t.fecha_hora >= now() - (:d2 * interval '1 day') AND t.fecha_hora < now() - (:d * interval '1 day'))::int AS pasajes_anterior,
         (SELECT COUNT(*) FROM alerta a JOIN bus b ON b.id_bus = a.id_bus
            WHERE b.id_linea = l.id_linea AND a.tipo = 'SOBRECUPO' AND a.fecha_hora >= now() - interval '7 days')::int AS sobrecupos_7d
       FROM linea l ORDER BY l.nombre`, { d: dias, d2: dias * 2 }),
    q(`SELECT to_char(date_trunc('day', t.fecha_hora AT TIME ZONE :tz), 'YYYY-MM-DD') AS dia, t.id_linea, COUNT(*)::int AS pasajes
       FROM transaccion t WHERE t.medio_pago = 'TARJETA' AND t.id_linea IS NOT NULL AND t.fecha_hora >= now() - (:d * interval '1 day')
       GROUP BY 1, 2 ORDER BY 1`, { tz: TZ, d: dias }),
    q(`SELECT e.id_estacion, e.nombre, COUNT(t.id_transaccion)::int AS pasajes,
         (SELECT COUNT(*) FROM alerta a WHERE a.id_estacion = e.id_estacion AND a.tipo = 'SOBRECUPO' AND a.fecha_hora >= now() - interval '7 days')::int AS sobrecupos_7d
       FROM estacion e LEFT JOIN transaccion t ON t.id_estacion = e.id_estacion AND t.medio_pago = 'TARJETA' AND t.fecha_hora >= now() - (:d * interval '1 day')
       GROUP BY e.id_estacion, e.nombre ORDER BY pasajes DESC, e.nombre LIMIT 8`, { d: dias }),
    q(`SELECT t.id_linea, e.nombre, COUNT(*)::int AS pasajes FROM transaccion t JOIN estacion e ON e.id_estacion = t.id_estacion
       WHERE t.medio_pago = 'TARJETA' AND t.id_linea IS NOT NULL AND t.fecha_hora >= now() - (:d * interval '1 day')
       GROUP BY t.id_linea, e.nombre ORDER BY pasajes DESC`, { d: dias }),
  ]);

  const analisis = evaluarLineas(lineas, dias);
  const lineasConTexto = analisis.lineas.map((l) => ({
    ...l,
    recomendacion: textoRecomendacion(l),
    estaciones_mas_usadas: porLineaEstacion.filter((x) => x.id_linea === l.id_linea).slice(0, 3).map((x) => x.nombre),
  }));
  return { dias, ...analisis, lineas: lineasConTexto, serie_diaria: serie, estaciones_top: estaciones };
}

// Crea alertas para el centro de control con las recomendaciones críticas y altas (sin repetir las abiertas de las últimas 24 h).
export async function notificarRecomendaciones(dias = 30) {
  const analisis = await analizarDemanda(dias);
  const creadas: any[] = [];
  for (const l of analisis.lineas) {
    if (l.nivel !== 'CRITICA' && l.nivel !== 'ALTA') continue;
    const descripcion = textoRecomendacion(l).slice(0, 255);
    const [dup] = await q(`SELECT 1 FROM alerta WHERE tipo = 'REFUERZO_FLOTA' AND descripcion = :d AND atendida = false AND fecha_hora >= now() - interval '24 hours' LIMIT 1`, { d: descripcion });
    if (dup) continue;
    const a: any = await Alerta.create({ tipo: 'REFUERZO_FLOTA', descripcion });
    emitir('alerta', a.toJSON());
    creadas.push(a.toJSON());
  }
  return { creadas: creadas.length, alertas: creadas };
}
