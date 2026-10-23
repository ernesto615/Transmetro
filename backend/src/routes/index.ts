import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomInt, randomUUID } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';

import {
  Municipalidad, Linea, LineaEstacion, Estacion, Acceso, Guardia, Operador, Parqueo, Bus, Piloto,
  TarjetaAcceso, Transaccion, Alerta, IncidenteSeguridad, Usuario, AuditoriaBus, Sugerencia, MovimientoFinanciero,
} from '../db.js';
import { PERSONAL, requireAuth, requireRole, signToken } from '../middleware/auth.js';
import { AppError, bad, conflict, forbidden, idParam, notFound } from '../lib/http.js';
import { crud } from './crud.js';
import { asignarLinea, cambiarParqueo, crearBus, registrarPosicion } from '../services/buses.js';
import { cumplimiento, distanciaEntre, obtenerLinea, reemplazarParadas } from '../services/lineas.js';
import { evaluarOcupacion } from '../services/capacidad.js';
import { cobrar, historialTarjeta, recargar } from '../services/pagos.js';
import { pasarela } from '../services/pasarela.js';
import { TARIFA_BASE } from '../services/pagos.js';
import { limitar } from '../middleware/limite.js';
import { analizarDemanda, notificarRecomendaciones } from '../services/demanda.js';
import { CATEGORIAS_EGRESO, CATEGORIAS_INGRESO, listarMovimientos, resumenFinanciero } from '../services/finanzas.js';
import { cifrar, descifrar, enmascarar, huella } from '../lib/cifrado.js';
import { guardarHorarioEstacion, guardarHorarioLinea, horariosSchema, horariosVacios, leerHorarios, listarParaAdmin } from '../services/horarios.js';
import { dashboard, reporteAccesosPorLinea, reporteEstaciones, reporteLineasBuses, toCsv } from '../services/reportes.js';
import { emitir } from '../realtime.js';

export const api = Router();

const id = z.coerce.number().int().positive();
const opcional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

// Un operador solo puede actuar sobre su propia estación (control por alcance).
function estacionPermitida(req: Request, idEstacion?: number) {
  const u = req.user!;
  if (u.rol === 'operador') {
    if (idEstacion && idEstacion !== u.idEstacion) throw forbidden('Un operador solo puede operar sobre su estación');
    if (!u.idEstacion) throw forbidden('El operador no tiene una estación asignada');
    return u.idEstacion;
  }
  if (!idEstacion) throw bad('Falta id_estacion');
  return idEstacion;
}
const scopeMuni = (req: Request) => (req.user!.rol === 'municipal' && req.user!.idMunicipalidad ? { id_municipalidad: req.user!.idMunicipalidad } : {});

// ---------- Autenticación (pública) ----------
const limiteAcceso = limitar(30, 10 * 60 * 1000);
api.post('/auth/login', limiteAcceso, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u: any = await Usuario.findOne({ where: { email: email.toLowerCase() } });
  // mismo mensaje para usuario inexistente o contraseña errónea
  if (!u || !u.activo || !(await bcrypt.compare(password, u.password_hash))) throw new AppError(401, 'Correo o contraseña incorrectos');
  res.json({
    token: signToken(u.id_usuario),
    usuario: { id: u.id_usuario, nombre: u.nombre, email: u.email, rol: u.rol, id_estacion: u.id_estacion, id_municipalidad: u.id_municipalidad },
  });
});

// ---------- Información pública para el ciudadano (sin sesión) ----------
// Solo expone la red (líneas, estaciones, recorridos) y la tarifa: nunca buses, pilotos ni datos internos.
const publico = Router();

publico.get('/red', async (_req, res) => {
  const [lineas, estaciones, municipalidades, horarios]: any[] = await Promise.all([
    Linea.findAll({
      include: [
        { association: 'municipalidad', attributes: ['nombre'] },
        { association: 'paradas', include: [{ association: 'estacion', attributes: ['id_estacion', 'nombre', 'latitud', 'longitud'] }] },
      ],
      order: [['nombre', 'ASC'], [{ model: LineaEstacion, as: 'paradas' }, 'orden', 'ASC']],
    }),
    Estacion.findAll({
      include: [{ association: 'municipalidad', attributes: ['nombre'] }, { association: 'lineas', include: [{ association: 'linea', attributes: ['nombre'] }] }],
      order: [['nombre', 'ASC']],
    }),
    Municipalidad.count(),
    leerHorarios(),
  ]);
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  res.json({
    tarifa: TARIFA_BASE,
    resumen: { lineas: lineas.length, estaciones: estaciones.length, municipalidades },
    lineas: lineas.map((l: any) => ({
      id_linea: l.id_linea, nombre: l.nombre, municipalidad: l.municipalidad?.nombre, distancia_total_km: num(l.distancia_total_km),
      horarios: horarios.lineas[l.id_linea] ?? horariosVacios(),
      paradas: l.paradas.map((p: any) => ({
        orden: p.orden, id_estacion: p.id_estacion, estacion: p.estacion.nombre,
        latitud: num(p.estacion.latitud), longitud: num(p.estacion.longitud), distancia_a_siguiente_km: num(p.distancia_a_siguiente_km),
      })),
    })),
    estaciones: estaciones.map((e: any) => ({
      id_estacion: e.id_estacion, nombre: e.nombre, municipalidad: e.municipalidad?.nombre,
      latitud: num(e.latitud), longitud: num(e.longitud), lineas: e.lineas.map((x: any) => x.linea.nombre),
      horarios: horarios.estaciones[e.id_estacion] ?? horariosVacios(),
    })),
  });
});

// Recarga sin iniciar sesión: solo sirve para sumar saldo. No devuelve el saldo ni datos del dueño.
publico.post('/recargar', limitar(15, 10 * 60 * 1000), async (req, res) => {
  const d = z.object({ numero: z.string().min(4).max(30), monto: z.number().min(1).max(500), referencia: z.string().max(40).optional() }).parse(req.body);
  if (!(await TarjetaAcceso.findOne({ where: { numero: d.numero } }))) throw notFound('No encontramos una tarjeta con ese número');
  const referencia = `pub:${d.referencia ?? randomUUID()}`;
  const auth = await pasarela.autorizar(d.monto, referencia);
  if (!auth.aprobado) throw conflict('El pago fue rechazado');
  const r: any = await recargar(d.numero, null, d.monto, referencia, 'RECARGA_EN_LINEA');
  res.status(201).json({ ok: true, tarjeta: `${d.numero.slice(0, 3)}••••${d.numero.slice(-4)}`, monto: d.monto, autorizacion: auth.codigo, duplicada: r.duplicada });
});
// Caja de sugerencias y quejas: cualquier persona puede enviar, sin cuenta. Los datos de contacto son opcionales.
publico.post('/sugerencias', limitar(5, 10 * 60 * 1000), async (req, res) => {
  const d = z.object({
    tipo: z.enum(['SUGERENCIA', 'QUEJA']),
    nombre: opcional(z.string().trim().max(100)),
    contacto: opcional(z.string().trim().max(120)),
    id_linea: opcional(id),
    id_estacion: opcional(id),
    mensaje: z.string().trim().min(10, 'Cuéntenos un poco más (mínimo 10 caracteres)').max(1000),
  }).parse(req.body);
  const s: any = await Sugerencia.create(d);
  res.status(201).json({ ok: true, folio: s.id_sugerencia });
});
api.use('/publico', publico);

// Registro público: cualquier persona puede crear una cuenta de PASAJERO (nunca de personal).
api.post('/auth/registro', limiteAcceso, async (req, res) => {
  const d = z.object({ nombre: z.string().min(2).max(100), email: z.string().email().max(120), password: z.string().min(8).max(72) }).parse(req.body);
  const u: any = await Usuario.create({ nombre: d.nombre, email: d.email.toLowerCase(), password_hash: await bcrypt.hash(d.password, 10), rol: 'pasajero' });
  res.status(201).json({
    token: signToken(u.id_usuario),
    usuario: { id: u.id_usuario, nombre: u.nombre, email: u.email, rol: u.rol, id_estacion: null, id_municipalidad: null },
  });
});

api.use(requireAuth);

api.get('/auth/me', (req, res) => res.json(req.user));

// ---------- Portal del pasajero (/api/mi/...) ----------
// Solo el pasajero entra aquí y siempre opera sobre SUS tarjetas (se filtra por id de usuario del token).
const mi = Router();
mi.use(requireRole('pasajero'));

mi.get('/tarjetas', async (req, res) => {
  res.json(await TarjetaAcceso.findAll({ where: { id_usuario: req.user!.id }, attributes: ['id_tarjeta', 'numero', 'saldo'], order: [['numero', 'ASC']] }));
});

// Datos del pasajero. El DPI y el NIT se guardan cifrados y solo se devuelven enmascarados.
const mascara = (cifrado: string | null) => (cifrado ? enmascarar(descifrar(cifrado)) : null);
async function perfilDe(idUsuario: number) {
  const u: any = await Usuario.findByPk(idUsuario);
  return {
    nombre: u.nombre, email: u.email, telefono: u.telefono ?? null,
    dpi: mascara(u.dpi_cifrado), nit: mascara(u.nit_cifrado),
    completo: !!u.telefono && !!(u.dpi_hash || u.nit_hash), // teléfono y al menos un documento
  };
}
mi.get('/perfil', async (req, res) => res.json(await perfilDe(req.user!.id)));

const telefonoGt = z.string().transform((s) => s.replace(/[\s-]/g, '').replace(/^\+?502/, '')).pipe(z.string().regex(/^[2-7]\d{7}$/, 'Teléfono inválido: escriba los 8 dígitos de Guatemala'));
const dpiGt = z.string().transform((s) => s.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{13}$/, 'El DPI debe tener 13 dígitos'));
const nitGt = z.string().transform((s) => s.replace(/[\s-]/g, '').toUpperCase()).pipe(z.string().regex(/^\d{4,12}[\dK]$/, 'NIT inválido: números y, al final, dígito verificador (número o K)'));

// Pedir una tarjeta nueva. La primera vez exige teléfono y DPI o NIT; luego no vuelve a pedirlos.
mi.post('/tarjetas/solicitar', async (req, res) => {
  const d = z.object({ telefono: opcional(telefonoGt), dpi: opcional(dpiGt), nit: opcional(nitGt) }).parse(req.body ?? {});
  const u: any = await Usuario.findByPk(req.user!.id);
  const telefono = d.telefono ?? u.telefono;
  if (!telefono) throw bad('Indique su número de teléfono para solicitar la tarjeta');
  if (!u.dpi_hash && !u.nit_hash && !d.dpi && !d.nit) throw bad('Indique su número de DPI o de NIT para solicitar la tarjeta');
  const cambios: any = { telefono };
  for (const [campo, valor, etiqueta] of [['dpi', d.dpi, 'DPI'], ['nit', d.nit, 'NIT']] as const) {
    if (!valor) continue;
    const h = huella(valor);
    const otro: any = await Usuario.findOne({ where: { [`${campo}_hash`]: h } });
    if (otro && otro.id_usuario !== u.id_usuario) throw conflict(`Ese ${etiqueta} ya está registrado en otra cuenta`);
    cambios[`${campo}_cifrado`] = cifrar(valor);
    cambios[`${campo}_hash`] = h;
  }
  if ((await TarjetaAcceso.count({ where: { id_usuario: u.id_usuario } })) >= 5) throw conflict('Una cuenta puede tener hasta 5 tarjetas');
  await u.update(cambios);
  for (let i = 0; i < 5; i++) {
    const numero = `TM-${String(randomInt(0, 1e8)).padStart(8, '0')}-${new Date().getFullYear()}`;
    try {
      return void res.status(201).json(await TarjetaAcceso.create({ numero, saldo: 0, id_usuario: u.id_usuario }));
    } catch (e) {
      if (!(e instanceof UniqueConstraintError)) throw e;
    }
  }
  throw new AppError(500, 'No se pudo generar el número de tarjeta, intente de nuevo');
});

// Vincular una tarjeta física que aún no tiene dueño.
mi.post('/tarjetas/vincular', async (req, res) => {
  const { numero } = z.object({ numero: z.string().min(4).max(30) }).parse(req.body);
  const t: any = await TarjetaAcceso.findOne({ where: { numero } });
  if (!t) throw notFound('No existe una tarjeta con ese número');
  if (t.id_usuario && t.id_usuario !== req.user!.id) throw conflict('Esa tarjeta ya pertenece a otra cuenta');
  res.json(await t.update({ id_usuario: req.user!.id }));
});

// Recarga en línea. La pasarela hoy es simulada (services/pasarela.ts) y no se reciben datos bancarios.
mi.post('/recargar', async (req, res) => {
  const d = z.object({ numero: z.string(), monto: z.number().min(1).max(500), referencia: z.string().max(40).optional() }).parse(req.body);
  if (!(await TarjetaAcceso.findOne({ where: { numero: d.numero, id_usuario: req.user!.id } }))) throw notFound('Tarjeta no encontrada en su cuenta');
  const referencia = `u${req.user!.id}:${d.referencia ?? randomUUID()}`; // el prefijo evita choques entre cuentas
  const auth = await pasarela.autorizar(d.monto, referencia);
  if (!auth.aprobado) throw conflict('El pago fue rechazado');
  res.status(201).json({ ...(await recargar(d.numero, null, d.monto, referencia, 'RECARGA_EN_LINEA')), autorizacion: auth.codigo });
});

// Dónde y cuándo pagó o recargó, y su último uso.
mi.get('/tarjetas/:numero/historial', async (req, res) => res.json(await historialTarjeta(String(req.params.numero), req.user!.id)));

// Consulta pública de recorridos: sin buses, pilotos ni datos internos.
mi.get('/lineas', async (_req, res) => {
  const lineas: any[] = await Linea.findAll({
    include: [{ association: 'municipalidad', attributes: ['nombre'] }, { association: 'paradas', include: [{ association: 'estacion', attributes: ['nombre'] }] }],
    order: [['nombre', 'ASC'], [{ model: LineaEstacion, as: 'paradas' }, 'orden', 'ASC']],
  });
  res.json(lineas.map((l) => ({
    id_linea: l.id_linea, nombre: l.nombre, municipalidad: l.municipalidad?.nombre, distancia_total_km: Number(l.distancia_total_km),
    paradas: l.paradas.map((p: any) => ({ orden: p.orden, estacion: p.estacion.nombre, distancia_a_siguiente_km: Number(p.distancia_a_siguiente_km) })),
  })));
});
api.use('/mi', mi);

// Todo lo que sigue es del personal: un pasajero no puede leer pilotos, buses ni reportes.
api.use(requireRole(...PERSONAL));

// ---------- Usuarios (solo admin) ----------
const usuarios = Router();
usuarios.use(requireRole('admin'));
usuarios.get('/', async (_req, res) => res.json(await Usuario.findAll({ attributes: { exclude: ['password_hash'] }, order: [['nombre', 'ASC']] })));
usuarios.post('/', async (req, res) => {
  const d = z.object({
    nombre: z.string().min(2), email: z.string().email(), password: z.string().min(8),
    rol: z.enum(['admin', 'municipal', 'operador', 'guardia']),
    id_estacion: id.nullish(), id_municipalidad: id.nullish(),
  }).parse(req.body);
  const { password, ...resto } = d;
  const u: any = await Usuario.create({ ...resto, email: d.email.toLowerCase(), password_hash: await bcrypt.hash(password, 10) });
  res.status(201).json({ id_usuario: u.id_usuario, nombre: u.nombre, email: u.email, rol: u.rol });
});
usuarios.patch('/:id', async (req, res) => {
  const u: any = await Usuario.findByPk(idParam(req));
  if (!u) throw notFound();
  const d = z.object({ activo: z.boolean(), rol: z.enum(['admin', 'municipal', 'operador', 'guardia']) }).partial().parse(req.body);
  await u.update(d);
  res.json({ id_usuario: u.id_usuario, activo: u.activo, rol: u.rol });
});
api.use('/usuarios', usuarios);

// ---------- Municipalidades ----------
api.use('/municipalidades', crud(Municipalidad, { pk: 'id_municipalidad', schema: z.object({ nombre: z.string().min(2).max(100) }), order: [['nombre', 'ASC']] }));

// ---------- Líneas ----------
const lineas = Router();
lineas.get('/:id/detalle', async (req, res) => res.json(await obtenerLinea(idParam(req))));
lineas.get('/:id/cumplimiento', async (req, res) => res.json(await cumplimiento(idParam(req))));
lineas.put('/:id/estaciones', requireRole('admin'), async (req, res) => {
  const d = z.object({
    paradas: z.array(z.object({ id_estacion: id, distancia_a_siguiente_km: z.number().min(0).max(999) })).max(100),
  }).parse(req.body);
  res.json(await reemplazarParadas(idParam(req), d.paradas));
});
lineas.use(crud(Linea, {
  pk: 'id_linea',
  schema: z.object({ nombre: z.string().min(2).max(100), id_municipalidad: id }),
  include: [{ association: 'municipalidad' }, { association: 'paradas', attributes: ['id_estacion'] }, { association: 'buses', attributes: ['id_bus'] }],
  order: [['nombre', 'ASC']],
  scope: scopeMuni,
}));
api.use('/lineas', lineas);

// ---------- Estaciones, accesos, guardias, operadores, parqueos ----------
const estaciones = Router();
estaciones.get('/distancia', async (req, res) => {
  const q = z.object({ desde: id, hasta: id }).parse(req.query);
  res.json(await distanciaEntre(q.desde, q.hasta));
});
estaciones.use(crud(Estacion, {
  pk: 'id_estacion',
  schema: z.object({
    nombre: z.string().min(2).max(100), id_municipalidad: id,
    latitud: lat.nullish(), longitud: lon.nullish(),
  }),
  include: [{ association: 'municipalidad' }, { association: 'lineas', include: [{ association: 'linea', attributes: ['id_linea', 'nombre'] }] }, { association: 'accesos', include: [{ association: 'guardias' }] }, { association: 'parqueos' }],
  order: [['nombre', 'ASC']],
  scope: scopeMuni,
}));
api.use('/estaciones', estaciones);

api.use('/accesos', crud(Acceso, {
  pk: 'id_acceso',
  schema: z.object({ nombre: z.string().min(1).max(100), id_estacion: id }),
  include: [{ association: 'estacion', attributes: ['id_estacion', 'nombre'] }, { association: 'guardias' }],
  scope: (req) => (req.query.id_estacion ? { id_estacion: Number(req.query.id_estacion) } : {}),
}));
api.use('/guardias', crud(Guardia, {
  pk: 'id_guardia',
  schema: z.object({ nombre: z.string().min(2).max(100), turno: z.string().max(20).nullish(), id_acceso: id }),
  include: [{ association: 'acceso', include: [{ association: 'estacion', attributes: ['id_estacion', 'nombre'] }] }],
}));
api.use('/operadores', crud(Operador, {
  pk: 'id_operador',
  schema: z.object({ nombre: z.string().min(2).max(100), usuario: z.string().min(3).max(50), id_estacion: id }),
  include: [{ association: 'estacion', attributes: ['id_estacion', 'nombre'] }],
}));
api.use('/parqueos', crud(Parqueo, {
  pk: 'id_parqueo',
  schema: z.object({ nombre: z.string().min(2).max(100), capacidad: z.number().int().min(0).nullish(), id_estacion: id.nullish() }),
  include: [{ association: 'estacion', attributes: ['id_estacion', 'nombre'] }],
}));

// ---------- Buses ----------
const buses = Router();
const busSchema = z.object({ placa: z.string().min(3).max(15), capacidad_maxima: z.number().int().min(1).max(300) });
buses.post('/', requireRole('admin'), async (req, res) => {
  const d = busSchema.extend({ id_parqueo: id, id_linea: id.nullish() }).parse(req.body);
  res.status(201).json(await crearBus(d, req.user!.id));
});
buses.put('/:id/linea', requireRole('admin'), async (req, res) => {
  const { id_linea } = z.object({ id_linea: id.nullable() }).parse(req.body);
  res.json(await asignarLinea(idParam(req), id_linea, req.user!.id));
});
buses.put('/:id/parqueo', requireRole('admin'), async (req, res) => {
  const { id_parqueo } = z.object({ id_parqueo: id }).parse(req.body); // obligatorio: nunca queda sin parqueo
  res.json(await cambiarParqueo(idParam(req), id_parqueo, req.user!.id));
});
buses.post('/:id/posicion', requireRole('admin', 'operador'), async (req, res) => {
  const d = z.object({ latitud: lat, longitud: lon }).parse(req.body);
  res.json(await registrarPosicion(idParam(req), d.latitud, d.longitud));
});
buses.get('/:id/historial', async (req, res) => {
  res.json(await AuditoriaBus.findAll({ where: { id_bus: idParam(req) }, order: [['fecha_hora', 'DESC']], limit: 100 }));
});
buses.use(crud(Bus, {
  pk: 'id_bus',
  schema: busSchema,
  include: [{ association: 'linea', attributes: ['id_linea', 'nombre'] }, { association: 'parqueo' }, { association: 'pilotos', attributes: ['id_piloto', 'nombre'] }],
  order: [['placa', 'ASC']],
}));
api.use('/buses', buses);

// ---------- Pilotos ----------
api.use('/pilotos', crud(Piloto, {
  pk: 'id_piloto',
  schema: z.object({
    nombre: z.string().min(2).max(100),
    historial_educativo: z.string().max(255).nullish(),
    direccion_residencia: z.string().max(255).nullish(),
    telefono: z.string().max(20).nullish(),
    email: z.string().email().max(100).nullish(),
    id_bus: id.nullish(),
  }),
  include: [{ association: 'bus', attributes: ['id_bus', 'placa', 'id_linea'], include: [{ association: 'linea', attributes: ['nombre'] }] }],
  order: [['nombre', 'ASC']],
  writeRoles: ['admin', 'municipal'],
}));

// ---------- Tarjetas y pagos ----------
api.use('/tarjetas', crud(TarjetaAcceso, {
  pk: 'id_tarjeta',
  schema: z.object({ numero: z.string().min(4).max(30) }),
  order: [['numero', 'ASC']],
  writeRoles: ['admin', 'operador'],
}));
api.post('/tarjetas/recargar', requireRole('admin', 'operador'), async (req, res) => {
  const d = z.object({ numero: z.string(), id_estacion: id.optional(), monto: z.number().positive().max(1000), referencia: z.string().max(64).optional() }).parse(req.body);
  res.json(await recargar(d.numero, estacionPermitida(req, d.id_estacion), d.monto, d.referencia));
});
api.post('/pagos', requireRole('admin', 'operador'), async (req, res) => {
  const d = z.object({ numero_tarjeta: z.string(), id_estacion: id.optional(), id_linea: opcional(id), monto: z.number().positive().max(100).optional(), referencia: z.string().max(64).optional() }).parse(req.body);
  const r = await cobrar({ ...d, id_estacion: estacionPermitida(req, d.id_estacion) });
  res.status(r.duplicada ? 200 : 201).json(r);
});
api.get('/tarjetas/:numero/historial', async (req, res) => res.json(await historialTarjeta(String(req.params.numero))));
api.get('/pagos', async (_req, res) => {
  res.json(await Transaccion.findAll({
    include: [{ association: 'tarjeta', attributes: ['numero'] }, { association: 'estacion', attributes: ['nombre'] }],
    order: [['fecha_hora', 'DESC']], limit: 200,
  }));
});

// ---------- Ocupación y alertas ----------
api.post('/ocupacion', requireRole('admin', 'operador'), async (req, res) => {
  const d = z.object({
    id_estacion: id.optional(), id_bus: id,
    pasajeros_en_espera: z.number().int().min(0).max(5000),
    pasajeros_a_bordo: z.number().int().min(0).max(500).optional(),
  }).parse(req.body);
  res.json(await evaluarOcupacion({ ...d, id_estacion: estacionPermitida(req, d.id_estacion) }));
});
api.get('/alertas', async (req, res) => {
  const where: any = {};
  if (req.query.atendida === 'true') where.atendida = true;
  if (req.query.atendida === 'false') where.atendida = false;
  res.json(await Alerta.findAll({
    where, order: [['fecha_hora', 'DESC']], limit: 200,
    include: [{ association: 'estacion', attributes: ['nombre'] }, { association: 'bus', attributes: ['placa'] }],
  }));
});
api.patch('/alertas/:id/atender', requireRole('admin', 'operador'), async (req, res) => {
  const a: any = await Alerta.findByPk(idParam(req));
  if (!a) throw notFound();
  res.json(await a.update({ atendida: true }));
});

// ---------- Incidentes y botón de pánico ----------
api.get('/incidentes', async (_req, res) => {
  res.json(await IncidenteSeguridad.findAll({
    order: [['fecha_hora', 'DESC']], limit: 200,
    include: [{ association: 'estacion', attributes: ['nombre'] }, { association: 'acceso', attributes: ['nombre'] }, { association: 'bus', attributes: ['placa'] }],
  }));
});
api.post('/incidentes', requireRole('admin', 'operador', 'guardia'), async (req, res) => {
  const d = z.object({
    tipo: z.string().min(2).max(50), descripcion: z.string().max(255).nullish(),
    id_estacion: id.nullish(), id_acceso: id.nullish(), id_bus: id.nullish(),
  }).parse(req.body);
  if (req.user!.rol === 'operador' && d.id_estacion && d.id_estacion !== req.user!.idEstacion) throw forbidden('Un operador solo reporta en su estación');
  const inc: any = await IncidenteSeguridad.create({ ...d, id_estacion: d.id_estacion ?? (req.user!.rol === 'operador' ? req.user!.idEstacion : null) });
  // todo incidente se difunde en vivo al personal; el pánico además tiene su propio aviso destacado
  emitir(d.tipo.toUpperCase() === 'PANICO' ? 'panico' : 'incidente', inc.toJSON());
  res.status(201).json(inc);
});
// Botón de pánico: registro inmediato + notificación en vivo al centro de control (RF-8)
api.post('/incidentes/panico', requireRole('admin', 'operador', 'guardia'), async (req, res) => {
  const d = z.object({ id_estacion: id.nullish(), id_acceso: id.nullish(), id_bus: id.nullish(), descripcion: z.string().max(255).nullish() }).parse(req.body);
  const inc: any = await IncidenteSeguridad.create({
    tipo: 'PANICO', descripcion: d.descripcion ?? 'Botón de pánico activado',
    id_estacion: d.id_estacion ?? req.user!.idEstacion, id_acceso: d.id_acceso, id_bus: d.id_bus,
  });
  emitir('panico', inc.toJSON());
  res.status(201).json(inc);
});

// ---------- Horarios de líneas y estaciones (se publican en la pantalla principal) ----------
api.get('/horarios', requireRole('admin', 'municipal'), async (_req, res) => res.json(await listarParaAdmin()));
api.put('/horarios/lineas/:id', requireRole('admin'), async (req, res) => res.json(await guardarHorarioLinea(idParam(req), horariosSchema.parse(req.body))));
api.put('/horarios/estaciones/:id', requireRole('admin'), async (req, res) => res.json(await guardarHorarioEstacion(idParam(req), horariosSchema.parse(req.body))));

// ---------- Sugerencias y quejas recibidas ----------
api.get('/sugerencias', requireRole('admin', 'municipal'), async (req, res) => {
  const where: any = {};
  if (['NUEVA', 'EN_REVISION', 'RESUELTA'].includes(String(req.query.estado))) where.estado = req.query.estado;
  res.json(await Sugerencia.findAll({
    where, order: [['fecha_hora', 'DESC']], limit: 300,
    include: [{ association: 'linea', attributes: ['nombre'] }, { association: 'estacion', attributes: ['nombre'] }],
  }));
});
api.patch('/sugerencias/:id', requireRole('admin', 'municipal'), async (req, res) => {
  const s: any = await Sugerencia.findByPk(idParam(req));
  if (!s) throw notFound();
  const d = z.object({ estado: z.enum(['NUEVA', 'EN_REVISION', 'RESUELTA']), nota_interna: z.string().max(500).nullish() }).partial().parse(req.body);
  res.json(await s.update(d));
});

// ---------- Dashboard financiero (solo administrador) ----------
const mesesSchema = z.coerce.number().int().min(1).max(24).default(6);
api.get('/finanzas/resumen', requireRole('admin'), async (req, res) => res.json(await resumenFinanciero(mesesSchema.parse(req.query.meses))));
api.get('/finanzas/categorias', requireRole('admin'), (_req, res) => res.json({ egreso: CATEGORIAS_EGRESO, ingreso: CATEGORIAS_INGRESO }));
api.get('/finanzas/movimientos', requireRole('admin'), async (req, res) => res.json(await listarMovimientos(mesesSchema.parse(req.query.meses))));
api.post('/finanzas/movimientos', requireRole('admin'), async (req, res) => {
  const d = z.object({
    tipo: z.enum(['INGRESO', 'EGRESO']),
    categoria: z.string().trim().min(2).max(60),
    monto: z.number().positive('El monto debe ser mayor que cero').max(10_000_000),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD').refine((f) => !Number.isNaN(Date.parse(f)), 'Fecha inválida'),
    descripcion: opcional(z.string().trim().max(255)),
    id_linea: opcional(id),
  }).parse(req.body);
  res.status(201).json(await MovimientoFinanciero.create({ ...d, id_usuario: req.user!.id }));
});
api.delete('/finanzas/movimientos/:id', requireRole('admin'), async (req, res) => {
  const m: any = await MovimientoFinanciero.findByPk(idParam(req));
  if (!m) throw notFound();
  await m.destroy();
  res.status(204).end();
});

// ---------- Demanda por línea y recomendaciones de capacidad ----------
const diasSchema = z.coerce.number().int().min(7).max(120).default(30);
api.get('/demanda', requireRole('admin', 'municipal'), async (req, res) => res.json(await analizarDemanda(diasSchema.parse(req.query.dias))));
api.post('/demanda/notificar', requireRole('admin'), async (req, res) => res.json(await notificarRecomendaciones(diasSchema.parse(req.query.dias))));

// ---------- Reportes y tablero ----------
function responder(req: Request, res: any, nombre: string, filas: Record<string, unknown>[]) {
  if (req.query.formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    return res.send(toCsv(filas));
  }
  res.json(filas);
}
const muni = (req: Request) => (req.user!.rol === 'municipal' ? req.user!.idMunicipalidad : null);

api.get('/reportes/estaciones', async (req, res) => responder(req, res, 'reporte-estaciones', await reporteEstaciones(muni(req))));
api.get('/reportes/lineas-buses', async (req, res) => {
  const datos = await reporteLineasBuses(muni(req));
  if (req.query.formato === 'csv') {
    const filas = datos.flatMap((l) =>
      (l.buses.length ? l.buses : [{ placa: '', capacidad: '', parqueo: '', pilotos: '' }]).map((b: any) => ({
        linea: l.linea, municipalidad: l.municipalidad, estaciones: l.estaciones, rango_permitido: l.rango_permitido,
        cumple_rango: l.cumple_rango ? 'Sí' : 'No', placa: b.placa, capacidad: b.capacidad, parqueo: b.parqueo, pilotos: b.pilotos,
      })),
    );
    return responder(req, res, 'reporte-lineas-buses', filas);
  }
  res.json(datos);
});
api.get('/reportes/accesos-por-linea', async (req, res) => responder(req, res, 'reporte-accesos-por-linea', await reporteAccesosPorLinea()));
api.get('/dashboard', async (req, res) => res.json(await dashboard(muni(req))));

api.use((_req, _res) => {
  throw notFound('Ruta no encontrada');
});
