-- =====================================================================
-- TRANSMETRO · Esquema PostgreSQL (equivale al que genera Sequelize)
-- Orden de ejecución: 01_esquema -> 02_reglas_triggers -> 03_datos_demo
-- ATENCIÓN: los DROP borran todo. Úselo solo en la base de desarrollo.
-- =====================================================================
DROP TABLE IF EXISTS movimiento_financiero, horario_estacion, horario_linea, sugerencia, auditoria_bus, usuario, incidente_seguridad, alerta, transaccion, tarjeta_acceso,
  piloto, bus, parqueo, operador, guardia, acceso, linea_estacion, estacion, linea, municipalidad CASCADE;

CREATE TABLE municipalidad (
  id_municipalidad SERIAL PRIMARY KEY,
  nombre           VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE linea (
  id_linea           SERIAL PRIMARY KEY,
  nombre             VARCHAR(100) NOT NULL,
  distancia_total_km NUMERIC(8,2) NOT NULL DEFAULT 0,      -- la mantiene un trigger
  id_municipalidad   INT NOT NULL REFERENCES municipalidad(id_municipalidad)
);

CREATE TABLE estacion (
  id_estacion      SERIAL PRIMARY KEY,
  nombre           VARCHAR(100) NOT NULL,
  id_municipalidad INT NOT NULL REFERENCES municipalidad(id_municipalidad),
  latitud          NUMERIC(9,6),
  longitud         NUMERIC(9,6)
);

-- Tabla intermedia: una estación puede estar en varias líneas y el orden va en la relación
CREATE TABLE linea_estacion (
  id_linea                 INT NOT NULL REFERENCES linea(id_linea),
  id_estacion              INT NOT NULL REFERENCES estacion(id_estacion),
  orden                    INT NOT NULL CHECK (orden > 0),
  distancia_a_siguiente_km NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (distancia_a_siguiente_km >= 0),
  PRIMARY KEY (id_linea, id_estacion),
  UNIQUE (id_linea, orden)
);

CREATE TABLE acceso (
  id_acceso   SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  id_estacion INT NOT NULL REFERENCES estacion(id_estacion)
);

CREATE TABLE guardia (
  id_guardia SERIAL PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  turno      VARCHAR(20),
  id_acceso  INT NOT NULL REFERENCES acceso(id_acceso)
);

CREATE TABLE operador (
  id_operador SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  usuario     VARCHAR(50) NOT NULL UNIQUE,
  id_estacion INT NOT NULL REFERENCES estacion(id_estacion)
);

CREATE TABLE parqueo (
  id_parqueo  SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  capacidad   INT CHECK (capacidad >= 0),
  id_estacion INT REFERENCES estacion(id_estacion)         -- "algunas estaciones tienen parqueo"
);

CREATE TABLE bus (
  id_bus           SERIAL PRIMARY KEY,
  placa            VARCHAR(15) NOT NULL UNIQUE,
  capacidad_maxima INT NOT NULL CHECK (capacidad_maxima > 0),
  id_linea         INT REFERENCES linea(id_linea),                      -- puede ser NULL (sin línea)
  id_parqueo       INT NOT NULL REFERENCES parqueo(id_parqueo),         -- NUNCA NULL (req. 7)
  latitud          NUMERIC(9,6),
  longitud         NUMERIC(9,6),
  ultima_posicion  TIMESTAMPTZ
);

CREATE TABLE piloto (
  id_piloto            SERIAL PRIMARY KEY,
  nombre               VARCHAR(100) NOT NULL,
  historial_educativo  VARCHAR(255),
  direccion_residencia VARCHAR(255),
  telefono             VARCHAR(20),
  email                VARCHAR(100),
  id_bus               INT REFERENCES bus(id_bus)
);

CREATE TABLE tarjeta_acceso (
  id_tarjeta SERIAL PRIMARY KEY,
  numero     VARCHAR(30) NOT NULL UNIQUE,
  saldo      NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),  -- el saldo nunca queda negativo
  id_usuario INT                                                  -- pasajero dueño (se agrega la FK al final)
);

CREATE TABLE transaccion (
  id_transaccion SERIAL PRIMARY KEY,
  id_tarjeta     INT NOT NULL REFERENCES tarjeta_acceso(id_tarjeta),
  id_estacion    INT REFERENCES estacion(id_estacion),                -- NULL en recargas en línea
  id_linea       INT REFERENCES linea(id_linea),                      -- línea del pasaje (análisis de demanda)
  fecha_hora     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto          NUMERIC(8,2) NOT NULL CHECK (monto > 0),
  medio_pago     VARCHAR(30) NOT NULL,                              -- TARJETA | RECARGA | RECARGA_EN_LINEA
  referencia     VARCHAR(64) UNIQUE                                 -- idempotencia: evita cobros duplicados
);

CREATE TABLE alerta (
  id_alerta   SERIAL PRIMARY KEY,
  tipo        VARCHAR(30) NOT NULL,                                 -- SOBRECUPO | ESPERA_EXTRA
  id_estacion INT REFERENCES estacion(id_estacion),
  id_bus      INT REFERENCES bus(id_bus),
  fecha_hora  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  descripcion VARCHAR(255),
  atendida    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE incidente_seguridad (
  id_incidente SERIAL PRIMARY KEY,
  id_estacion  INT REFERENCES estacion(id_estacion),
  id_acceso    INT REFERENCES acceso(id_acceso),
  id_bus       INT REFERENCES bus(id_bus),
  fecha_hora   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo         VARCHAR(50) NOT NULL,
  descripcion  VARCHAR(255)
);

CREATE TABLE usuario (
  id_usuario       SERIAL PRIMARY KEY,
  nombre           VARCHAR(100) NOT NULL,
  email            VARCHAR(120) NOT NULL UNIQUE,
  password_hash    VARCHAR(100) NOT NULL,
  rol              VARCHAR(20) NOT NULL CHECK (rol IN ('admin','municipal','operador','guardia','pasajero')),
  id_estacion      INT REFERENCES estacion(id_estacion),
  id_municipalidad INT REFERENCES municipalidad(id_municipalidad),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  telefono         VARCHAR(20),
  dpi_cifrado      VARCHAR(200),                -- AES-256-GCM; lo cifra la API
  dpi_hash         VARCHAR(64) UNIQUE,          -- huella HMAC para detectar duplicados
  nit_cifrado      VARCHAR(200),
  nit_hash         VARCHAR(64) UNIQUE
);

CREATE TABLE auditoria_bus (
  id_auditoria        SERIAL PRIMARY KEY,
  id_bus              INT NOT NULL REFERENCES bus(id_bus),
  id_linea_anterior   INT,
  id_linea_nueva      INT,
  id_parqueo_anterior INT,
  id_parqueo_nuevo    INT,
  id_usuario          INT,
  fecha_hora          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tarjeta_acceso ADD CONSTRAINT fk_tarjeta_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario);

-- Libro de ingresos y egresos (dashboard financiero del administrador)
CREATE TABLE movimiento_financiero (
  id_movimiento SERIAL PRIMARY KEY,
  tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  categoria     VARCHAR(60) NOT NULL,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL,
  descripcion   VARCHAR(255),
  id_linea      INT REFERENCES linea(id_linea),
  id_usuario    INT REFERENCES usuario(id_usuario),
  creado        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Caja de sugerencias y quejas (formulario público)
CREATE TABLE sugerencia (
  id_sugerencia SERIAL PRIMARY KEY,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('SUGERENCIA','QUEJA')),
  nombre        VARCHAR(100),
  contacto      VARCHAR(120),
  id_linea      INT REFERENCES linea(id_linea),
  id_estacion   INT REFERENCES estacion(id_estacion),
  mensaje       TEXT NOT NULL,
  fecha_hora    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado        VARCHAR(20) NOT NULL DEFAULT 'NUEVA' CHECK (estado IN ('NUEVA','EN_REVISION','RESUELTA')),
  nota_interna  VARCHAR(500)
);

-- Horarios editables por el administrador; sin fila = sin servicio ese día
CREATE TABLE horario_linea (
  id_linea    INT NOT NULL REFERENCES linea(id_linea) ON DELETE CASCADE,
  tipo_dia    VARCHAR(20) NOT NULL CHECK (tipo_dia IN ('LUNES_VIERNES','SABADO','DOMINGO_FESTIVOS')),
  hora_inicio VARCHAR(5) NOT NULL,
  hora_fin    VARCHAR(5) NOT NULL,
  PRIMARY KEY (id_linea, tipo_dia),
  CHECK (hora_inicio < hora_fin)
);
CREATE TABLE horario_estacion (
  id_estacion INT NOT NULL REFERENCES estacion(id_estacion) ON DELETE CASCADE,
  tipo_dia    VARCHAR(20) NOT NULL CHECK (tipo_dia IN ('LUNES_VIERNES','SABADO','DOMINGO_FESTIVOS')),
  hora_inicio VARCHAR(5) NOT NULL,
  hora_fin    VARCHAR(5) NOT NULL,
  PRIMARY KEY (id_estacion, tipo_dia),
  CHECK (hora_inicio < hora_fin)
);

CREATE INDEX idx_bus_linea     ON bus(id_linea);
CREATE INDEX idx_acceso_est    ON acceso(id_estacion);
CREATE INDEX idx_alerta_estado ON alerta(atendida, fecha_hora DESC);
CREATE INDEX idx_tx_fecha      ON transaccion(fecha_hora DESC);
CREATE INDEX idx_tx_linea      ON transaccion(id_linea, fecha_hora);
CREATE INDEX idx_mov_fecha     ON movimiento_financiero(fecha);
