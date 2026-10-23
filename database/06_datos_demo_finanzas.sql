-- =====================================================================
-- Datos de DEMOSTRACIÓN para los dashboards de finanzas y de demanda.
-- Ejecutar DESPUÉS de 01, 02 y 03. Es el mismo SQL que usa `npm run seed`.
-- Genera: 200 tarjetas demo, 120 días de pasajes y recargas, alertas de sobrecupo y 5 meses de ingresos/egresos.
-- =====================================================================
INSERT INTO tarjeta_acceso (numero, saldo)
   SELECT 'TM-D' || lpad(g::text, 4, '0') || '-2026', round((random() * 60)::numeric, 2) FROM generate_series(1, 200) AS g;

WITH demanda(linea, base, crece) AS (VALUES
       ('Línea 1 Centro-Norte', 250, true), ('Línea 2 Occidente', 160, false), ('Línea 3 Sur', 80, false), ('Línea 4 San José Pinula', 130, true)),
     tj AS (SELECT MIN(id_tarjeta) AS m FROM tarjeta_acceso WHERE numero LIKE 'TM-D%'),
     est AS (SELECT id_linea, array_agg(id_estacion ORDER BY orden) AS ids FROM linea_estacion GROUP BY id_linea),
     dias AS (
       SELECT l.id_linea, (current_date - g.n) AS dia,
              round(d.base * (CASE WHEN extract(isodow FROM current_date - g.n) >= 6 THEN 0.6 ELSE 1 END)
                    * (CASE WHEN d.crece THEN 0.75 + (119 - g.n) * 0.003 ELSE 1 END)
                    * (0.85 + random() * 0.3))::int AS pasajes
       FROM linea l JOIN demanda d ON d.linea = l.nombre CROSS JOIN generate_series(0, 119) AS g(n))
   INSERT INTO transaccion (id_tarjeta, id_estacion, id_linea, fecha_hora, monto, medio_pago)
   SELECT tj.m + floor(random() * 200)::int,
          est.ids[1 + floor(random() * cardinality(est.ids))::int],
          dd.id_linea,
          dd.dia + interval '5 hours' + random() * interval '15 hours',
          1.00, 'TARJETA'
   FROM dias dd JOIN est ON est.id_linea = dd.id_linea CROSS JOIN tj
   CROSS JOIN LATERAL generate_series(1, dd.pasajes) AS p(i);

WITH tj AS (SELECT MIN(id_tarjeta) AS m FROM tarjeta_acceso WHERE numero LIKE 'TM-D%'),
     rec AS (
       SELECT (current_date - g.n) AS dia,
              round(29 * (CASE WHEN extract(isodow FROM current_date - g.n) >= 6 THEN 0.6 ELSE 1 END) * (0.85 + random() * 0.3))::int AS n
       FROM generate_series(0, 119) AS g(n))
   INSERT INTO transaccion (id_tarjeta, id_estacion, fecha_hora, monto, medio_pago)
   SELECT tj.m + floor(random() * 200)::int,
          CASE WHEN x.enlinea THEN NULL ELSE (SELECT MIN(id_estacion) FROM estacion) + floor(random() * (SELECT COUNT(*) FROM estacion))::int END,
          rec.dia + interval '5 hours' + random() * interval '15 hours',
          x.monto,
          CASE WHEN x.enlinea THEN 'RECARGA_EN_LINEA' ELSE 'RECARGA' END
   FROM rec CROSS JOIN tj
   CROSS JOIN LATERAL generate_series(1, rec.n) AS p(i)
   CROSS JOIN LATERAL (SELECT random() < 0.4 AS enlinea, ((ARRAY[5, 10, 20, 50])[1 + floor(random() * 4)::int])::numeric AS monto WHERE p.i > 0) AS x;

WITH est AS (SELECT id_linea, array_agg(id_estacion ORDER BY orden) AS ids FROM linea_estacion GROUP BY id_linea)
   INSERT INTO alerta (tipo, id_estacion, id_bus, fecha_hora, descripcion, atendida)
   SELECT 'SOBRECUPO', est.ids[1 + floor(random() * cardinality(est.ids))::int], b.id_bus,
          now() - random() * interval '7 days', 'Sobrecupo en hora pico (dato de demostración)', true
   FROM (VALUES ('Línea 1 Centro-Norte', 14), ('Línea 4 San José Pinula', 5), ('Línea 2 Occidente', 3), ('Línea 3 Sur', 1)) AS d(linea, cantidad)
   JOIN linea l ON l.nombre = d.linea
   JOIN est ON est.id_linea = l.id_linea
   CROSS JOIN LATERAL generate_series(1, d.cantidad) AS p(i)
   CROSS JOIN LATERAL (SELECT id_bus FROM bus WHERE id_linea = l.id_linea AND p.i > 0 ORDER BY random() LIMIT 1) AS b;

INSERT INTO movimiento_financiero (tipo, categoria, monto, fecha, descripcion, creado)
   SELECT v.tipo, v.categoria, round((v.monto * (0.95 + random() * 0.1))::numeric, 2),
          (date_trunc('month', current_date) - (m.n * interval '1 month') + interval '1 day')::date, v.descripcion, now()
   FROM generate_series(0, 4) AS m(n)
   CROSS JOIN (VALUES
     ('EGRESO', 'Combustible', 14800, 'Diésel de la flota'),
     ('EGRESO', 'Salarios y personal', 31500, 'Pilotos, guardias y operadores'),
     ('EGRESO', 'Mantenimiento de flota', 6200, 'Mantenimiento preventivo'),
     ('EGRESO', 'Seguros', 2400, 'Seguro de la flota'),
     ('EGRESO', 'Tecnología y nube', 900, 'Hosting y servicios en la nube'),
     ('EGRESO', 'Administración', 1700, 'Gastos administrativos'),
     ('INGRESO', 'Subsidio municipal', 40000, 'Aporte mensual de las municipalidades'),
     ('INGRESO', 'Publicidad en estaciones', 3500, 'Contratos de publicidad')) AS v(tipo, categoria, monto, descripcion);
