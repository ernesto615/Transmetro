import { Sequelize, DataTypes as D } from 'sequelize';
import { env } from './config/env.js';

// Bases en la nube (Neon, Render, etc.) exigen SSL. Se activa con ?sslmode=require en la URL o con DATABASE_SSL=true.
// Neon suspende la base tras unos minutos sin uso: el pool libera conexiones ociosas antes de que las corte.
const urlBd = new URL(env.DATABASE_URL);
urlBd.searchParams.delete('channel_binding'); // node-postgres no lo soporta
const usaSsl = process.env.DATABASE_SSL === 'true' || urlBd.searchParams.get('sslmode') === 'require';

export const sequelize = new Sequelize(urlBd.toString(), {
  logging: false,
  dialectOptions: usaSsl ? { ssl: { require: true }, keepAlive: true } : { keepAlive: true },
  pool: { max: 5, min: 0, idle: 10_000, acquire: 30_000, evict: 5_000 },
});

const T = { timestamps: false, freezeTableName: true };
const pk = (name: string) => ({ [name]: { type: D.INTEGER, autoIncrement: true, primaryKey: true } });
const fk = (allowNull = true) => ({ type: D.INTEGER, allowNull });

export const Municipalidad = sequelize.define('municipalidad', {
  ...pk('id_municipalidad'),
  nombre: { type: D.STRING(100), allowNull: false, unique: true },
}, T);

export const Linea = sequelize.define('linea', {
  ...pk('id_linea'),
  nombre: { type: D.STRING(100), allowNull: false },
  distancia_total_km: { type: D.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
  id_municipalidad: fk(false),
}, T);

export const Estacion = sequelize.define('estacion', {
  ...pk('id_estacion'),
  nombre: { type: D.STRING(100), allowNull: false },
  id_municipalidad: fk(false),
  // Extensión del ER original: coordenadas para el mapa (RF-5)
  latitud: { type: D.DECIMAL(9, 6) },
  longitud: { type: D.DECIMAL(9, 6) },
}, T);

export const LineaEstacion = sequelize.define('linea_estacion', {
  id_linea: { type: D.INTEGER, primaryKey: true },
  id_estacion: { type: D.INTEGER, primaryKey: true },
  orden: { type: D.INTEGER, allowNull: false },
  distancia_a_siguiente_km: { type: D.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
}, T);

export const Acceso = sequelize.define('acceso', {
  ...pk('id_acceso'),
  nombre: { type: D.STRING(100), allowNull: false },
  id_estacion: fk(false),
}, T);

export const Guardia = sequelize.define('guardia', {
  ...pk('id_guardia'),
  nombre: { type: D.STRING(100), allowNull: false },
  turno: { type: D.STRING(20) },
  id_acceso: fk(false),
}, T);

export const Operador = sequelize.define('operador', {
  ...pk('id_operador'),
  nombre: { type: D.STRING(100), allowNull: false },
  usuario: { type: D.STRING(50), allowNull: false, unique: true },
  id_estacion: fk(false),
}, T);

export const Parqueo = sequelize.define('parqueo', {
  ...pk('id_parqueo'),
  nombre: { type: D.STRING(100), allowNull: false },
  capacidad: { type: D.INTEGER },
  id_estacion: fk(true), // "algunas estaciones tienen parqueos"
}, T);

export const Bus = sequelize.define('bus', {
  ...pk('id_bus'),
  placa: { type: D.STRING(15), allowNull: false, unique: true },
  capacidad_maxima: { type: D.INTEGER, allowNull: false },
  id_linea: fk(true), // un bus puede no estar asignado a ninguna línea
  id_parqueo: fk(false), // pero nunca puede quedar sin parqueo
  latitud: { type: D.DECIMAL(9, 6) },
  longitud: { type: D.DECIMAL(9, 6) },
  ultima_posicion: { type: D.DATE },
}, T);

export const Piloto = sequelize.define('piloto', {
  ...pk('id_piloto'),
  nombre: { type: D.STRING(100), allowNull: false },
  historial_educativo: { type: D.STRING(255) },
  direccion_residencia: { type: D.STRING(255) },
  telefono: { type: D.STRING(20) },
  email: { type: D.STRING(100) },
  id_bus: fk(true),
}, T);

export const TarjetaAcceso = sequelize.define('tarjeta_acceso', {
  ...pk('id_tarjeta'),
  numero: { type: D.STRING(30), allowNull: false, unique: true },
  saldo: { type: D.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
  id_usuario: fk(true), // pasajero dueño de la tarjeta (null = tarjeta sin dueño)
}, T);

export const Transaccion = sequelize.define('transaccion', {
  ...pk('id_transaccion'),
  id_tarjeta: fk(false),
  id_estacion: fk(true), // null en recargas en línea
  id_linea: fk(true), // línea en la que se pagó el pasaje (alimenta el análisis de demanda)
  fecha_hora: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  monto: { type: D.DECIMAL(8, 2), allowNull: false },
  medio_pago: { type: D.STRING(30), allowNull: false },
  // Clave de idempotencia: evita cobros duplicados al sincronizar registros offline (RF-12)
  referencia: { type: D.STRING(64), unique: true },
}, T);

export const Alerta = sequelize.define('alerta', {
  ...pk('id_alerta'),
  tipo: { type: D.STRING(30), allowNull: false },
  id_estacion: fk(true),
  id_bus: fk(true),
  fecha_hora: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  descripcion: { type: D.STRING(255) },
  atendida: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
}, T);

export const IncidenteSeguridad = sequelize.define('incidente_seguridad', {
  ...pk('id_incidente'),
  id_estacion: fk(true),
  id_acceso: fk(true),
  id_bus: fk(true),
  fecha_hora: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  tipo: { type: D.STRING(50), allowNull: false },
  descripcion: { type: D.STRING(255) },
}, T);

// Usuarios del sistema (autenticación y RBAC)
export const Usuario = sequelize.define('usuario', {
  ...pk('id_usuario'),
  nombre: { type: D.STRING(100), allowNull: false },
  email: { type: D.STRING(120), allowNull: false, unique: true },
  password_hash: { type: D.STRING(100), allowNull: false },
  rol: { type: D.STRING(20), allowNull: false }, // admin | municipal | operador | guardia | pasajero
  id_estacion: fk(true),
  id_municipalidad: fk(true),
  activo: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  // Datos del pasajero para solicitar tarjeta. DPI y NIT se guardan cifrados; la huella evita duplicados.
  telefono: { type: D.STRING(20) },
  dpi_cifrado: { type: D.STRING(200) },
  dpi_hash: { type: D.STRING(64), unique: true },
  nit_cifrado: { type: D.STRING(200) },
  nit_hash: { type: D.STRING(64), unique: true },
}, T);

// Libro de ingresos y egresos (administración): base del dashboard financiero
export const MovimientoFinanciero = sequelize.define('movimiento_financiero', {
  ...pk('id_movimiento'),
  tipo: { type: D.STRING(10), allowNull: false }, // INGRESO | EGRESO
  categoria: { type: D.STRING(60), allowNull: false },
  monto: { type: D.DECIMAL(12, 2), allowNull: false },
  fecha: { type: D.DATEONLY, allowNull: false },
  descripcion: { type: D.STRING(255) },
  id_linea: fk(true),
  id_usuario: fk(true),
  creado: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
}, T);

// Caja de sugerencias y quejas (pública)
export const Sugerencia = sequelize.define('sugerencia', {
  ...pk('id_sugerencia'),
  tipo: { type: D.STRING(20), allowNull: false }, // SUGERENCIA | QUEJA
  nombre: { type: D.STRING(100) },
  contacto: { type: D.STRING(120) },
  id_linea: fk(true),
  id_estacion: fk(true),
  mensaje: { type: D.TEXT, allowNull: false },
  fecha_hora: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  estado: { type: D.STRING(20), allowNull: false, defaultValue: 'NUEVA' }, // NUEVA | EN_REVISION | RESUELTA
  nota_interna: { type: D.STRING(500) },
}, T);

// Horarios de servicio por línea y de atención por estación, por tipo de día
export const HorarioLinea = sequelize.define('horario_linea', {
  id_linea: { type: D.INTEGER, primaryKey: true },
  tipo_dia: { type: D.STRING(20), primaryKey: true }, // LUNES_VIERNES | SABADO | DOMINGO_FESTIVOS
  hora_inicio: { type: D.STRING(5), allowNull: false },
  hora_fin: { type: D.STRING(5), allowNull: false },
}, T);

export const HorarioEstacion = sequelize.define('horario_estacion', {
  id_estacion: { type: D.INTEGER, primaryKey: true },
  tipo_dia: { type: D.STRING(20), primaryKey: true },
  hora_inicio: { type: D.STRING(5), allowNull: false },
  hora_fin: { type: D.STRING(5), allowNull: false },
}, T);

// Historial de cambios de asignación de buses (RNF-6)
export const AuditoriaBus = sequelize.define('auditoria_bus', {
  ...pk('id_auditoria'),
  id_bus: fk(false),
  id_linea_anterior: fk(true),
  id_linea_nueva: fk(true),
  id_parqueo_anterior: fk(true),
  id_parqueo_nuevo: fk(true),
  id_usuario: fk(true),
  fecha_hora: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
}, T);

// ---- Relaciones ----
Municipalidad.hasMany(Linea, { foreignKey: 'id_municipalidad' });
Linea.belongsTo(Municipalidad, { foreignKey: 'id_municipalidad', as: 'municipalidad' });
Municipalidad.hasMany(Estacion, { foreignKey: 'id_municipalidad' });
Estacion.belongsTo(Municipalidad, { foreignKey: 'id_municipalidad', as: 'municipalidad' });

Linea.hasMany(LineaEstacion, { foreignKey: 'id_linea', as: 'paradas' });
LineaEstacion.belongsTo(Linea, { foreignKey: 'id_linea', as: 'linea' });
Estacion.hasMany(LineaEstacion, { foreignKey: 'id_estacion', as: 'lineas' });
LineaEstacion.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });

Estacion.hasMany(Acceso, { foreignKey: 'id_estacion', as: 'accesos' });
Acceso.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
Acceso.hasMany(Guardia, { foreignKey: 'id_acceso', as: 'guardias' });
Guardia.belongsTo(Acceso, { foreignKey: 'id_acceso', as: 'acceso' });
Estacion.hasMany(Operador, { foreignKey: 'id_estacion', as: 'operadores' });
Operador.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
Estacion.hasMany(Parqueo, { foreignKey: 'id_estacion', as: 'parqueos' });
Parqueo.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });

Linea.hasMany(Bus, { foreignKey: 'id_linea', as: 'buses' });
Bus.belongsTo(Linea, { foreignKey: 'id_linea', as: 'linea' });
Parqueo.hasMany(Bus, { foreignKey: 'id_parqueo', as: 'buses' });
Bus.belongsTo(Parqueo, { foreignKey: 'id_parqueo', as: 'parqueo' });
Bus.hasMany(Piloto, { foreignKey: 'id_bus', as: 'pilotos' });
Piloto.belongsTo(Bus, { foreignKey: 'id_bus', as: 'bus' });

TarjetaAcceso.hasMany(Transaccion, { foreignKey: 'id_tarjeta' });
Transaccion.belongsTo(TarjetaAcceso, { foreignKey: 'id_tarjeta', as: 'tarjeta' });
Estacion.hasMany(Transaccion, { foreignKey: 'id_estacion' });
Transaccion.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });

Alerta.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
Alerta.belongsTo(Bus, { foreignKey: 'id_bus', as: 'bus' });
IncidenteSeguridad.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
IncidenteSeguridad.belongsTo(Acceso, { foreignKey: 'id_acceso', as: 'acceso' });
IncidenteSeguridad.belongsTo(Bus, { foreignKey: 'id_bus', as: 'bus' });

AuditoriaBus.belongsTo(Bus, { foreignKey: 'id_bus', as: 'bus' });
Usuario.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
MovimientoFinanciero.belongsTo(Linea, { foreignKey: 'id_linea', as: 'linea' });
Sugerencia.belongsTo(Linea, { foreignKey: 'id_linea', as: 'linea' });
Sugerencia.belongsTo(Estacion, { foreignKey: 'id_estacion', as: 'estacion' });
Linea.hasMany(HorarioLinea, { foreignKey: 'id_linea', as: 'horarios' });
Estacion.hasMany(HorarioEstacion, { foreignKey: 'id_estacion', as: 'horarios' });
Usuario.hasMany(TarjetaAcceso, { foreignKey: 'id_usuario', as: 'tarjetas' });
TarjetaAcceso.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'duenio' });
