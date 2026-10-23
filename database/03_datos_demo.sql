-- =====================================================================
-- Datos de demostración (mismos que `npm run seed`). Ejecutar tras 01 y 02.
-- Los INSERT usan nombres en lugar de IDs fijos, así se pueden reordenar sin romper claves.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- para generar hashes bcrypt compatibles con la API

INSERT INTO municipalidad (nombre) VALUES ('Guatemala'), ('Mixco'), ('Villa Nueva');

INSERT INTO estacion (nombre, id_municipalidad, latitud, longitud) VALUES
  ('Centra Norte',       (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),   14.661500, -90.498500),
  ('Zona 6',             (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),   14.646000, -90.497500),
  ('Plaza Barrios',      (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),   14.622600, -90.513300),
  ('Trébol',             (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),   14.606800, -90.527000),
  ('Mixco Centro',       (SELECT id_municipalidad FROM municipalidad WHERE nombre='Mixco'),       14.633000, -90.607000),
  ('El Naranjo',         (SELECT id_municipalidad FROM municipalidad WHERE nombre='Mixco'),       14.628000, -90.570000),
  ('Aguilar Batres',     (SELECT id_municipalidad FROM municipalidad WHERE nombre='Villa Nueva'), 14.560000, -90.560000),
  ('Villa Nueva Centro', (SELECT id_municipalidad FROM municipalidad WHERE nombre='Villa Nueva'), 14.526000, -90.588000);

INSERT INTO linea (nombre, id_municipalidad) VALUES
  ('Línea 1 Centro-Norte', (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala')),
  ('Línea 2 Occidente',    (SELECT id_municipalidad FROM municipalidad WHERE nombre='Mixco')),
  ('Línea 3 Sur',          (SELECT id_municipalidad FROM municipalidad WHERE nombre='Villa Nueva'));

-- Recorridos: (línea, estación, orden, km hasta la siguiente). La última estación lleva 0.
-- El trigger trg_distancia_linea calcula linea.distancia_total_km automáticamente.
INSERT INTO linea_estacion (id_linea, id_estacion, orden, distancia_a_siguiente_km)
SELECT l.id_linea, e.id_estacion, v.orden, v.km
FROM (VALUES
  ('Línea 1 Centro-Norte','Centra Norte',1,1.7), ('Línea 1 Centro-Norte','Zona 6',2,3.1),
  ('Línea 1 Centro-Norte','Plaza Barrios',3,2.3), ('Línea 1 Centro-Norte','Trébol',4,0),
  ('Línea 2 Occidente','Mixco Centro',1,3.8), ('Línea 2 Occidente','El Naranjo',2,4.6),
  ('Línea 2 Occidente','Trébol',3,2.3), ('Línea 2 Occidente','Plaza Barrios',4,0),
  ('Línea 3 Sur','Trébol',1,6.0), ('Línea 3 Sur','Aguilar Batres',2,4.9), ('Línea 3 Sur','Villa Nueva Centro',3,0)
) AS v(linea, estacion, orden, km)
JOIN linea l ON l.nombre = v.linea
JOIN estacion e ON e.nombre = v.estacion;

INSERT INTO acceso (nombre, id_estacion)
SELECT v.acceso, e.id_estacion
FROM (VALUES
  ('Acceso principal','Centra Norte'), ('Acceso peatonal','Centra Norte'), ('Acceso oriente','Zona 6'),
  ('Acceso norte','Plaza Barrios'), ('Acceso sur','Plaza Barrios'),
  ('Acceso A','Trébol'), ('Acceso B','Trébol'), ('Acceso C','Trébol'),
  ('Acceso plaza','Mixco Centro'), ('Acceso calzada','Mixco Centro'), ('Acceso único','El Naranjo'),
  ('Acceso norte','Aguilar Batres'), ('Acceso parque','Villa Nueva Centro'), ('Acceso mercado','Villa Nueva Centro')
) AS v(acceso, estacion)
JOIN estacion e ON e.nombre = v.estacion;

INSERT INTO guardia (nombre, turno, id_acceso)
SELECT v.guardia, v.turno, a.id_acceso
FROM (VALUES
  ('Mario Tzoc','Diurno','Acceso principal','Centra Norte'), ('Luis Pérez','Nocturno','Acceso principal','Centra Norte'),
  ('Rosa Ajú','Diurno','Acceso peatonal','Centra Norte'), ('Jorge Calel','Diurno','Acceso oriente','Zona 6'),
  ('Carlos Xol','Diurno','Acceso norte','Plaza Barrios'), ('Ana Cux','Nocturno','Acceso sur','Plaza Barrios'),
  ('Pedro Sac','Diurno','Acceso A','Trébol'), ('Elena Coy','Diurno','Acceso B','Trébol'), ('Walter Gómez','Nocturno','Acceso C','Trébol'),
  ('Sonia Batz','Diurno','Acceso plaza','Mixco Centro'), ('Omar Tum','Nocturno','Acceso calzada','Mixco Centro'),
  ('Julio Ixcoy','Diurno','Acceso único','El Naranjo'), ('Hugo Morales','Diurno','Acceso norte','Aguilar Batres'),
  ('Mynor Lemus','Diurno','Acceso parque','Villa Nueva Centro'), ('Lidia Ramos','Nocturno','Acceso mercado','Villa Nueva Centro')
) AS v(guardia, turno, acceso, estacion)
JOIN estacion e ON e.nombre = v.estacion
JOIN acceso a ON a.nombre = v.acceso AND a.id_estacion = e.id_estacion;

INSERT INTO parqueo (nombre, capacidad, id_estacion) VALUES
  ('Parqueo Centra Norte', 12, (SELECT id_estacion FROM estacion WHERE nombre='Centra Norte')),
  ('Parqueo Mixco',        10, (SELECT id_estacion FROM estacion WHERE nombre='Mixco Centro')),
  ('Parqueo Villa Nueva',  10, (SELECT id_estacion FROM estacion WHERE nombre='Villa Nueva Centro'));

-- Buses: Línea 1 (4 estaciones -> 4 a 8 buses), Línea 2 (4 -> 4 a 8), Línea 3 (3 -> 3 a 6), 2 sin línea.
INSERT INTO bus (placa, capacidad_maxima, id_linea, id_parqueo)
SELECT v.placa, v.cap, l.id_linea, p.id_parqueo
FROM (VALUES
  ('TM-100',120,'Línea 1 Centro-Norte','Parqueo Centra Norte'), ('TM-101',160,'Línea 1 Centro-Norte','Parqueo Centra Norte'),
  ('TM-102',120,'Línea 1 Centro-Norte','Parqueo Centra Norte'), ('TM-103',160,'Línea 1 Centro-Norte','Parqueo Centra Norte'),
  ('TM-104',120,'Línea 1 Centro-Norte','Parqueo Centra Norte'),
  ('TM-105',120,'Línea 2 Occidente','Parqueo Mixco'), ('TM-106',160,'Línea 2 Occidente','Parqueo Mixco'),
  ('TM-107',120,'Línea 2 Occidente','Parqueo Mixco'), ('TM-108',160,'Línea 2 Occidente','Parqueo Mixco'),
  ('TM-109',120,'Línea 3 Sur','Parqueo Villa Nueva'), ('TM-110',160,'Línea 3 Sur','Parqueo Villa Nueva'),
  ('TM-111',120,'Línea 3 Sur','Parqueo Villa Nueva'),
  ('TM-112',120,NULL,'Parqueo Centra Norte'), ('TM-113',160,NULL,'Parqueo Centra Norte')
) AS v(placa, cap, linea, parqueo)
LEFT JOIN linea l ON l.nombre = v.linea
JOIN parqueo p ON p.nombre = v.parqueo;

INSERT INTO piloto (nombre, historial_educativo, direccion_residencia, telefono, email, id_bus)
SELECT v.nombre, v.hist, v.dir, v.tel, v.email, b.id_bus
FROM (VALUES
  ('Marvin Choc','Perito Contador; licencia tipo A','Zona 3, Ciudad de Guatemala','5555-0110','piloto1@transmetro.gt','TM-100'),
  ('Edwin Tojín','Bachiller en Computación; curso de conducción profesional','Zona 4, Ciudad de Guatemala','5555-0111','piloto2@transmetro.gt','TM-101'),
  ('Brenda Lux','Perito Contador; licencia tipo A','Zona 5, Ciudad de Guatemala','5555-0112','piloto3@transmetro.gt','TM-102'),
  ('Óscar Pop','Bachiller en Computación; curso de conducción profesional','Zona 6, Ciudad de Guatemala','5555-0113','piloto4@transmetro.gt','TM-103'),
  ('Karina Alvarado','Perito Contador; licencia tipo A','Zona 7, Ciudad de Guatemala','5555-0114','piloto5@transmetro.gt','TM-104'),
  ('Rubén Cifuentes','Bachiller en Computación; curso de conducción profesional','Zona 8, Ciudad de Guatemala','5555-0115','piloto6@transmetro.gt','TM-105'),
  ('Gladys Menchú','Perito Contador; licencia tipo A','Zona 9, Ciudad de Guatemala','5555-0116','piloto7@transmetro.gt','TM-106'),
  ('Tomás Rax','Bachiller en Computación; curso de conducción profesional','Zona 10, Ciudad de Guatemala','5555-0117','piloto8@transmetro.gt','TM-107')
) AS v(nombre, hist, dir, tel, email, placa)
JOIN bus b ON b.placa = v.placa;

-- =====================================================================
-- Línea 4: San José Pinula -> Santa Catarina Pinula -> Condado Concepción -> Zona Pradera
--          -> Zona 10 -> Obelisco -> Trébol (estación compartida con las líneas 1, 2 y 3)
-- Coordenadas y distancias aproximadas (demostración).
-- =====================================================================
INSERT INTO municipalidad (nombre) VALUES ('San José Pinula'), ('Santa Catarina Pinula');

INSERT INTO estacion (nombre, id_municipalidad, latitud, longitud) VALUES
  ('San José Pinula',       (SELECT id_municipalidad FROM municipalidad WHERE nombre='San José Pinula'),       14.545000, -90.411000),
  ('Santa Catarina Pinula', (SELECT id_municipalidad FROM municipalidad WHERE nombre='Santa Catarina Pinula'), 14.571000, -90.490000),
  ('Condado Concepción',    (SELECT id_municipalidad FROM municipalidad WHERE nombre='Santa Catarina Pinula'), 14.598500, -90.490000),
  ('Zona Pradera',          (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),             14.601000, -90.500000),
  ('Zona 10',               (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),             14.605500, -90.512000),
  ('Obelisco',              (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala'),             14.603000, -90.520000);

INSERT INTO linea (nombre, id_municipalidad)
VALUES ('Línea 4 San José Pinula', (SELECT id_municipalidad FROM municipalidad WHERE nombre='San José Pinula'));

INSERT INTO linea_estacion (id_linea, id_estacion, orden, distancia_a_siguiente_km)
SELECT l.id_linea, e.id_estacion, v.orden, v.km
FROM (VALUES
  ('San José Pinula',1,11.7), ('Santa Catarina Pinula',2,4.0), ('Condado Concepción',3,1.4), ('Zona Pradera',4,1.8),
  ('Zona 10',5,1.2), ('Obelisco',6,1.1), ('Trébol',7,0)
) AS v(estacion, orden, km)
JOIN linea l ON l.nombre = 'Línea 4 San José Pinula'
JOIN estacion e ON e.nombre = v.estacion;

INSERT INTO acceso (nombre, id_estacion)
SELECT v.acceso, e.id_estacion
FROM (VALUES
  ('Acceso principal','San José Pinula'), ('Acceso principal','Santa Catarina Pinula'), ('Acceso único','Condado Concepción'),
  ('Acceso A','Zona Pradera'), ('Acceso norte','Zona 10'), ('Acceso sur','Zona 10'), ('Acceso único','Obelisco')
) AS v(acceso, estacion)
JOIN estacion e ON e.nombre = v.estacion;

INSERT INTO guardia (nombre, turno, id_acceso)
SELECT v.guardia, 'Diurno', a.id_acceso
FROM (VALUES
  ('Erick Boj','Acceso principal','San José Pinula'), ('Marta Cho','Acceso principal','Santa Catarina Pinula'),
  ('Danilo Ixcot','Acceso único','Condado Concepción'), ('Silvia Ajú','Acceso A','Zona Pradera'),
  ('Néstor Pu','Acceso norte','Zona 10'), ('Reyna Tax','Acceso sur','Zona 10'), ('Alex Quej','Acceso único','Obelisco')
) AS v(guardia, acceso, estacion)
JOIN estacion e ON e.nombre = v.estacion
JOIN acceso a ON a.nombre = v.acceso AND a.id_estacion = e.id_estacion;

INSERT INTO parqueo (nombre, capacidad, id_estacion)
VALUES ('Parqueo San José Pinula', 10, (SELECT id_estacion FROM estacion WHERE nombre='San José Pinula'));

-- 7 estaciones: mínimo 7 y máximo 14 buses
INSERT INTO bus (placa, capacidad_maxima, id_linea, id_parqueo)
SELECT v.placa, v.cap, (SELECT id_linea FROM linea WHERE nombre='Línea 4 San José Pinula'),
       (SELECT id_parqueo FROM parqueo WHERE nombre='Parqueo San José Pinula')
FROM (VALUES ('TM-114',120),('TM-115',160),('TM-116',120),('TM-117',160),('TM-118',120),('TM-119',160),('TM-120',120)) AS v(placa, cap);

-- Horarios de servicio iniciales (el administrador los edita desde la aplicación)
INSERT INTO horario_linea (id_linea, tipo_dia, hora_inicio, hora_fin)
SELECT l.id_linea, v.dia, v.ini, v.fin
FROM (VALUES
  ('Línea 1 Centro-Norte','LUNES_VIERNES','05:00','20:00'), ('Línea 1 Centro-Norte','SABADO','05:00','19:00'), ('Línea 1 Centro-Norte','DOMINGO_FESTIVOS','06:30','19:00'),
  ('Línea 2 Occidente','LUNES_VIERNES','05:30','20:00'),    ('Línea 2 Occidente','SABADO','05:30','19:00'),    ('Línea 2 Occidente','DOMINGO_FESTIVOS','06:30','19:00'),
  ('Línea 3 Sur','LUNES_VIERNES','05:00','21:00'),          ('Línea 3 Sur','SABADO','05:00','20:00'),          ('Línea 3 Sur','DOMINGO_FESTIVOS','06:00','20:00'),
  ('Línea 4 San José Pinula','LUNES_VIERNES','05:00','21:00'), ('Línea 4 San José Pinula','SABADO','05:00','20:00'), ('Línea 4 San José Pinula','DOMINGO_FESTIVOS','06:00','20:00')
) AS v(linea, dia, ini, fin)
JOIN linea l ON l.nombre = v.linea;

INSERT INTO operador (nombre, usuario, id_estacion)
VALUES ('Operador Centra Norte', 'operador.centra', (SELECT id_estacion FROM estacion WHERE nombre='Centra Norte'));


-- Usuarios de la aplicación. crypt(..., gen_salt('bf', 10)) genera bcrypt, el mismo formato que usa la API.
INSERT INTO usuario (nombre, email, password_hash, rol, id_estacion, id_municipalidad) VALUES
  ('Administrador Central',   'admin@transmetro.gt',     crypt('Admin123!',   gen_salt('bf', 10)), 'admin',     NULL, NULL),
  ('Personal Muni Guatemala', 'municipal@transmetro.gt', crypt('Muni12345!',  gen_salt('bf', 10)), 'municipal', NULL, (SELECT id_municipalidad FROM municipalidad WHERE nombre='Guatemala')),
  ('Operador Centra Norte',   'operador@transmetro.gt',  crypt('Oper12345!',  gen_salt('bf', 10)), 'operador',  (SELECT id_estacion FROM estacion WHERE nombre='Centra Norte'), NULL),
  ('Guardia Centra Norte',    'guardia@transmetro.gt',   crypt('Guardia123!', gen_salt('bf', 10)), 'guardia',   (SELECT id_estacion FROM estacion WHERE nombre='Centra Norte'), NULL);

-- Pasajero de prueba con su tarjeta (las otras dos tarjetas quedan sin dueño, listas para vincular)
INSERT INTO usuario (nombre, email, password_hash, rol)
VALUES ('Pasajero de Prueba', 'pasajero@transmetro.gt', crypt('Pasajero123!', gen_salt('bf', 10)), 'pasajero');

INSERT INTO tarjeta_acceso (numero, saldo, id_usuario) VALUES
  ('TM-0001-2026', 25.00, (SELECT id_usuario FROM usuario WHERE email = 'pasajero@transmetro.gt')),
  ('TM-0002-2026', 0.50, NULL),
  ('TM-0003-2026', 100.00, NULL);
