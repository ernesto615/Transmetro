-- =====================================================================
-- Consultas de los reportes (constancia de los queries para el documento).
-- Cada una corresponde a un endpoint de la API y a una pantalla de la web.
-- =====================================================================

-- Q1 · Reporte de estaciones            (GET /api/reportes/estaciones · pantalla Reportes)
CREATE OR REPLACE VIEW v_reporte_estaciones AS
SELECT e.id_estacion,
       e.nombre                                         AS estacion,
       m.nombre                                         AS municipalidad,
       (SELECT STRING_AGG(l.nombre, ', ' ORDER BY l.nombre)
          FROM linea_estacion le JOIN linea l ON l.id_linea = le.id_linea
         WHERE le.id_estacion = e.id_estacion)          AS lineas,
       (SELECT COUNT(*) FROM acceso a WHERE a.id_estacion = e.id_estacion) AS accesos,
       (SELECT COUNT(*) FROM guardia g JOIN acceso a ON a.id_acceso = g.id_acceso
         WHERE a.id_estacion = e.id_estacion)           AS guardias,
       (SELECT COUNT(*) FROM parqueo p WHERE p.id_estacion = e.id_estacion) AS parqueos,
       -- cumple si tiene accesos y ninguno está sin guardia
       (EXISTS (SELECT 1 FROM acceso a WHERE a.id_estacion = e.id_estacion)
        AND NOT EXISTS (SELECT 1 FROM acceso a
                         WHERE a.id_estacion = e.id_estacion
                           AND NOT EXISTS (SELECT 1 FROM guardia g WHERE g.id_acceso = a.id_acceso))) AS cumple_guardia_minima
FROM estacion e
JOIN municipalidad m ON m.id_municipalidad = e.id_municipalidad;

SELECT * FROM v_reporte_estaciones ORDER BY estacion;

-- Q2 · Líneas con buses asignados y verificación del rango N..2N   (GET /api/reportes/lineas-buses)
CREATE OR REPLACE VIEW v_reporte_lineas_buses AS
WITH n AS (SELECT id_linea, COUNT(*) AS estaciones FROM linea_estacion GROUP BY id_linea),
     b AS (SELECT id_linea, COUNT(*) AS buses FROM bus WHERE id_linea IS NOT NULL GROUP BY id_linea)
SELECT l.id_linea,
       l.nombre                         AS linea,
       m.nombre                         AS municipalidad,
       l.distancia_total_km,
       COALESCE(n.estaciones, 0)        AS estaciones,
       COALESCE(b.buses, 0)             AS buses_asignados,
       COALESCE(n.estaciones, 0) || ' - ' || COALESCE(n.estaciones, 0) * 2 AS rango_permitido,
       COALESCE(n.estaciones, 0) > 0
         AND COALESCE(b.buses, 0) BETWEEN COALESCE(n.estaciones, 0) AND COALESCE(n.estaciones, 0) * 2 AS cumple_rango
FROM linea l
JOIN municipalidad m ON m.id_municipalidad = l.id_municipalidad
LEFT JOIN n ON n.id_linea = l.id_linea
LEFT JOIN b ON b.id_linea = l.id_linea;

SELECT * FROM v_reporte_lineas_buses ORDER BY linea;

-- Q3 · Todos los accesos de cada línea  (GET /api/reportes/accesos-por-linea)
SELECT l.nombre AS linea, le.orden, e.nombre AS estacion, a.nombre AS acceso
FROM linea l
JOIN linea_estacion le ON le.id_linea = l.id_linea
JOIN estacion e        ON e.id_estacion = le.id_estacion
JOIN acceso a          ON a.id_estacion = e.id_estacion
ORDER BY l.nombre, le.orden, a.nombre;

-- Q4 · Detalle de buses de una línea, con parqueo y piloto
SELECT b.placa, b.capacidad_maxima, p.nombre AS parqueo, pi.nombre AS piloto
FROM bus b
JOIN parqueo p     ON p.id_parqueo = b.id_parqueo
LEFT JOIN piloto pi ON pi.id_bus = b.id_bus
WHERE b.id_linea = (SELECT id_linea FROM linea WHERE nombre = 'Línea 1 Centro-Norte')
ORDER BY b.placa;

-- Q5 · Distancia entre dos estaciones de una misma línea (suma de tramos)
SELECT SUM(le.distancia_a_siguiente_km) AS km
FROM linea_estacion le
WHERE le.id_linea = (SELECT id_linea FROM linea WHERE nombre = 'Línea 1 Centro-Norte')
  AND le.orden >= (SELECT orden FROM linea_estacion WHERE id_linea = le.id_linea
                    AND id_estacion = (SELECT id_estacion FROM estacion WHERE nombre = 'Centra Norte'))
  AND le.orden <  (SELECT orden FROM linea_estacion WHERE id_linea = le.id_linea
                    AND id_estacion = (SELECT id_estacion FROM estacion WHERE nombre = 'Plaza Barrios'));

-- Q6 · Estaciones que pertenecen a más de una línea (relación muchos a muchos)
SELECT e.nombre AS estacion, COUNT(*) AS lineas
FROM linea_estacion le JOIN estacion e ON e.id_estacion = le.id_estacion
GROUP BY e.nombre HAVING COUNT(*) > 1;

-- Q7 · Buses sin línea asignada
SELECT placa, capacidad_maxima FROM bus WHERE id_linea IS NULL;

-- Q8 · Recaudo por estación (solo cobros de pasaje)
SELECT e.nombre AS estacion, COUNT(*) AS cobros, SUM(t.monto) AS total
FROM transaccion t JOIN estacion e ON e.id_estacion = t.id_estacion
WHERE t.medio_pago = 'TARJETA'
GROUP BY e.nombre ORDER BY total DESC;

-- Q9 · Alertas abiertas por tipo (tablero)
SELECT tipo, COUNT(*) AS abiertas FROM alerta WHERE NOT atendida GROUP BY tipo;

-- Q10 · Historial de cambios de asignación de un bus (RNF-6)
SELECT a.fecha_hora, a.id_linea_anterior, a.id_linea_nueva, a.id_parqueo_anterior, a.id_parqueo_nuevo
FROM auditoria_bus a JOIN bus b ON b.id_bus = a.id_bus
WHERE b.placa = 'TM-100' ORDER BY a.fecha_hora DESC;

-- Q11 · ¿Dónde y cuándo pagó o recargó una tarjeta? (GET /api/mi/tarjetas/:numero/historial)
SELECT t.fecha_hora, t.medio_pago, t.monto, COALESCE(e.nombre, 'En línea') AS lugar
FROM transaccion t
JOIN tarjeta_acceso c ON c.id_tarjeta = t.id_tarjeta
LEFT JOIN estacion e  ON e.id_estacion = t.id_estacion
WHERE c.numero = 'TM-0001-2026'
ORDER BY t.fecha_hora DESC;

-- Q12 · Último uso (pasaje) de cada tarjeta, con su dueño
SELECT c.numero, u.nombre AS pasajero, MAX(t.fecha_hora) AS ultimo_uso
FROM tarjeta_acceso c
LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
LEFT JOIN transaccion t ON t.id_tarjeta = c.id_tarjeta AND t.medio_pago = 'TARJETA'
GROUP BY c.numero, u.nombre;

-- Q13 · Horarios de servicio por línea (se muestran en la pantalla principal)
SELECT l.nombre AS linea,
       MAX(CASE WHEN h.tipo_dia='LUNES_VIERNES'    THEN h.hora_inicio || ' a ' || h.hora_fin END) AS lunes_a_viernes,
       MAX(CASE WHEN h.tipo_dia='SABADO'           THEN h.hora_inicio || ' a ' || h.hora_fin END) AS sabado,
       MAX(CASE WHEN h.tipo_dia='DOMINGO_FESTIVOS' THEN h.hora_inicio || ' a ' || h.hora_fin END) AS domingo_y_festivos
FROM linea l LEFT JOIN horario_linea h ON h.id_linea = l.id_linea
GROUP BY l.nombre ORDER BY l.nombre;

-- Q14 · Sugerencias y quejas pendientes
SELECT fecha_hora, tipo, estado, COALESCE(nombre,'Anónimo') AS de, LEFT(mensaje, 80) AS mensaje
FROM sugerencia WHERE estado <> 'RESUELTA' ORDER BY fecha_hora DESC;

-- Q15 · Pasajeros con su documento registrado (los números están cifrados: solo se ve si existen)
SELECT nombre, email, telefono, dpi_hash IS NOT NULL AS tiene_dpi, nit_hash IS NOT NULL AS tiene_nit
FROM usuario WHERE rol = 'pasajero';

-- Q16 · Flujo de caja mensual: entradas (recargas + otros ingresos) menos salidas (egresos)
SELECT to_char(m.mes, 'YYYY-MM') AS mes,
       COALESCE(t.recargas, 0) + COALESCE(v.ingresos, 0) AS entradas,
       COALESCE(v.egresos, 0) AS salidas,
       COALESCE(t.recargas, 0) + COALESCE(v.ingresos, 0) - COALESCE(v.egresos, 0) AS flujo_neto
FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS m(mes)
LEFT JOIN (SELECT date_trunc('month', fecha_hora) AS mes, SUM(monto) AS recargas
           FROM transaccion WHERE medio_pago LIKE 'RECARGA%' GROUP BY 1) t ON t.mes = m.mes
LEFT JOIN (SELECT date_trunc('month', fecha::timestamp) AS mes,
                  SUM(monto) FILTER (WHERE tipo = 'INGRESO') AS ingresos, SUM(monto) FILTER (WHERE tipo = 'EGRESO') AS egresos
           FROM movimiento_financiero GROUP BY 1) v ON v.mes = m.mes
ORDER BY m.mes;

-- Q17 · Línea más usada: pasajes en los últimos 30 días y pasajes por bus por día
SELECT l.nombre AS linea,
       COUNT(t.id_transaccion) AS pasajes,
       ROUND(COUNT(t.id_transaccion) / 30.0, 1) AS pasajes_por_dia,
       (SELECT COUNT(*) FROM bus b WHERE b.id_linea = l.id_linea) AS buses,
       ROUND(COUNT(t.id_transaccion) / 30.0 / NULLIF((SELECT COUNT(*) FROM bus b WHERE b.id_linea = l.id_linea), 0), 1) AS pasajes_por_bus_dia
FROM linea l
LEFT JOIN transaccion t ON t.id_linea = l.id_linea AND t.medio_pago = 'TARJETA' AND t.fecha_hora >= now() - interval '30 days'
GROUP BY l.id_linea, l.nombre ORDER BY pasajes DESC;

-- Q18 · Alertas de sobrecupo por línea en los últimos 7 días
SELECT l.nombre AS linea, COUNT(*) AS sobrecupos
FROM alerta a JOIN bus b ON b.id_bus = a.id_bus JOIN linea l ON l.id_linea = b.id_linea
WHERE a.tipo = 'SOBRECUPO' AND a.fecha_hora >= now() - interval '7 days'
GROUP BY l.nombre ORDER BY sobrecupos DESC;
