-- =====================================================================
-- Ejemplos para practicar cambios (por si le piden modificar tablas o datos en la defensa).
-- Ejecute cada bloque por separado. Los bloques con --  ERROR ESPERADO muestran las reglas en acción.
-- =====================================================================

-- 1) Insertar datos nuevos -------------------------------------------------
INSERT INTO estacion (nombre, id_municipalidad, latitud, longitud)
VALUES ('Parque Central', (SELECT id_municipalidad FROM municipalidad WHERE nombre = 'Guatemala'), 14.6407, -90.5133);

INSERT INTO acceso (nombre, id_estacion)
VALUES ('Acceso único', (SELECT id_estacion FROM estacion WHERE nombre = 'Parque Central'));

INSERT INTO guardia (nombre, turno, id_acceso)
VALUES ('Nuevo Guardia', 'Diurno',
        (SELECT a.id_acceso FROM acceso a JOIN estacion e ON e.id_estacion = a.id_estacion
          WHERE e.nombre = 'Parque Central' AND a.nombre = 'Acceso único'));

-- 2) Agregar la estación al final de la Línea 3 (el trigger recalcula la distancia total)
UPDATE linea_estacion SET distancia_a_siguiente_km = 3.5
 WHERE id_linea = (SELECT id_linea FROM linea WHERE nombre = 'Línea 3 Sur')
   AND orden = 3;                                   -- el último tramo deja de ser 0
INSERT INTO linea_estacion (id_linea, id_estacion, orden, distancia_a_siguiente_km)
VALUES ((SELECT id_linea FROM linea WHERE nombre = 'Línea 3 Sur'),
        (SELECT id_estacion FROM estacion WHERE nombre = 'Parque Central'), 4, 0);
SELECT nombre, distancia_total_km FROM linea;       -- la Línea 3 ahora suma 6.0 + 4.9 + 3.5

-- 3) Cambiar un bus de parqueo (el parqueo es obligatorio) ----------------
UPDATE bus SET id_parqueo = (SELECT id_parqueo FROM parqueo WHERE nombre = 'Parqueo Mixco') WHERE placa = 'TM-112';
-- UPDATE bus SET id_parqueo = NULL WHERE placa = 'TM-112';          -- ERROR ESPERADO: NOT NULL

-- 4) Asignar un bus sin línea a una línea
UPDATE bus SET id_linea = (SELECT id_linea FROM linea WHERE nombre = 'Línea 2 Occidente') WHERE placa = 'TM-112';
-- Intentar pasar el máximo (2N) lanza ERROR ESPERADO: 'La línea ... ya tiene el máximo de buses permitido'

-- 5) Quitar buses de una línea: se permite hasta llegar al mínimo (N buses = N estaciones)
-- La Línea 1 tiene 5 buses y 4 estaciones: el primer retiro funciona y el segundo falla.
UPDATE bus SET id_linea = NULL WHERE placa = 'TM-104';
-- UPDATE bus SET id_linea = NULL WHERE placa = 'TM-103';            -- ERROR ESPERADO: quedaría con menos buses que estaciones

-- 6) Modificar la estructura (ejemplos de ALTER) --------------------------
ALTER TABLE bus ADD COLUMN IF NOT EXISTS anio_modelo INT CHECK (anio_modelo >= 2000);
ALTER TABLE piloto ADD COLUMN IF NOT EXISTS numero_licencia VARCHAR(20);
-- ALTER TABLE bus DROP COLUMN anio_modelo;                          -- para deshacer
-- Si agrega columnas, recuerde agregarlas también en backend/src/db.ts (modelo Sequelize)
-- y en el esquema zod de routes/ si deben aceptarse desde la API.

-- 7) Corregir o borrar datos ---------------------------------------------
UPDATE tarjeta_acceso SET saldo = 10.00 WHERE numero = 'TM-0002-2026';
-- DELETE FROM estacion WHERE nombre = 'Parque Central';             -- falla si tiene accesos o está en una línea (claves foráneas)

-- 8) Reiniciar solo los datos operativos (conserva usuarios) ---------------
-- TRUNCATE alerta, incidente_seguridad, transaccion, auditoria_bus RESTART IDENTITY;

-- 9) Reiniciar TODO desde cero: vuelva a ejecutar 01, 02 y 03 en ese orden.
