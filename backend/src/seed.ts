import bcrypt from 'bcryptjs';
import {
  sequelize, Municipalidad, Linea, Estacion, Acceso, Guardia, Operador, Parqueo, Bus, Piloto,
  TarjetaAcceso, Usuario, HorarioLinea,
} from './db.js';
import { reemplazarParadas } from './services/lineas.js';
import { sembrarFinanzasDemo } from './seed-finanzas.js';

// ATENCIÓN: borra y recrea todas las tablas. Datos de demostración (coordenadas aproximadas).
export async function sembrar() {
  await sequelize.sync({ force: true });

  const [gt, mx, vn]: any[] = await Municipalidad.bulkCreate(
    [{ nombre: 'Guatemala' }, { nombre: 'Mixco' }, { nombre: 'Villa Nueva' }],
    { returning: true },
  );

  const est = async (nombre: string, m: any, latitud: number, longitud: number, accesos: [string, string[]][]) => {
    const e: any = await Estacion.create({ nombre, id_municipalidad: m.id_municipalidad, latitud, longitud });
    for (const [an, guardias] of accesos) {
      const a: any = await Acceso.create({ nombre: an, id_estacion: e.id_estacion });
      for (const g of guardias) await Guardia.create({ nombre: g, turno: Math.random() > 0.5 ? 'Diurno' : 'Nocturno', id_acceso: a.id_acceso });
    }
    return e;
  };

  const centra = await est('Centra Norte', gt, 14.6615, -90.4985, [['Acceso principal', ['Mario Tzoc', 'Luis Pérez']], ['Acceso peatonal', ['Rosa Ajú']]]);
  const zona6 = await est('Zona 6', gt, 14.646, -90.4975, [['Acceso oriente', ['Jorge Calel']]]);
  const barrios = await est('Plaza Barrios', gt, 14.6226, -90.5133, [['Acceso norte', ['Carlos Xol']], ['Acceso sur', ['Ana Cux']]]);
  const trebol = await est('Trébol', gt, 14.6068, -90.527, [['Acceso A', ['Pedro Sac']], ['Acceso B', ['Elena Coy']], ['Acceso C', ['Walter Gómez']]]);
  const mixco = await est('Mixco Centro', mx, 14.633, -90.607, [['Acceso plaza', ['Sonia Batz']], ['Acceso calzada', ['Omar Tum']]]);
  const naranjo = await est('El Naranjo', mx, 14.628, -90.57, [['Acceso único', ['Julio Ixcoy']]]);
  const aguilar = await est('Aguilar Batres', vn, 14.56, -90.56, [['Acceso norte', ['Hugo Morales']]]);
  const villa = await est('Villa Nueva Centro', vn, 14.526, -90.588, [['Acceso parque', ['Mynor Lemus']], ['Acceso mercado', ['Lidia Ramos']]]);

  const l1: any = await Linea.create({ nombre: 'Línea 1 Centro-Norte', id_municipalidad: gt.id_municipalidad });
  const l2: any = await Linea.create({ nombre: 'Línea 2 Occidente', id_municipalidad: mx.id_municipalidad });
  const l3: any = await Linea.create({ nombre: 'Línea 3 Sur', id_municipalidad: vn.id_municipalidad });

  await reemplazarParadas(l1.id_linea, [
    { id_estacion: centra.id_estacion, distancia_a_siguiente_km: 1.7 },
    { id_estacion: zona6.id_estacion, distancia_a_siguiente_km: 3.1 },
    { id_estacion: barrios.id_estacion, distancia_a_siguiente_km: 2.3 },
    { id_estacion: trebol.id_estacion, distancia_a_siguiente_km: 0 },
  ]);
  await reemplazarParadas(l2.id_linea, [
    { id_estacion: mixco.id_estacion, distancia_a_siguiente_km: 3.8 },
    { id_estacion: naranjo.id_estacion, distancia_a_siguiente_km: 4.6 },
    { id_estacion: trebol.id_estacion, distancia_a_siguiente_km: 2.3 },
    { id_estacion: barrios.id_estacion, distancia_a_siguiente_km: 0 },
  ]);
  await reemplazarParadas(l3.id_linea, [
    { id_estacion: trebol.id_estacion, distancia_a_siguiente_km: 6.0 },
    { id_estacion: aguilar.id_estacion, distancia_a_siguiente_km: 4.9 },
    { id_estacion: villa.id_estacion, distancia_a_siguiente_km: 0 },
  ]);

  const [p1, p2, p3]: any[] = await Parqueo.bulkCreate(
    [
      { nombre: 'Parqueo Centra Norte', capacidad: 12, id_estacion: centra.id_estacion },
      { nombre: 'Parqueo Mixco', capacidad: 10, id_estacion: mixco.id_estacion },
      { nombre: 'Parqueo Villa Nueva', capacidad: 10, id_estacion: villa.id_estacion },
    ],
    { returning: true },
  );

  // L1: 4 estaciones -> 4..8 buses | L2: 4 -> 4..8 | L3: 3 -> 3..6 | 2 buses sin línea
  const plan: [any, any, number][] = [
    [l1, p1, 5], [l2, p2, 4], [l3, p3, 3], [null, p1, 2],
  ];
  const buses: any[] = [];
  let n = 100;
  for (const [linea, parqueo, cantidad] of plan) {
    for (let i = 0; i < cantidad; i++) {
      buses.push(await Bus.create({
        placa: `TM-${n++}`, capacidad_maxima: i % 2 ? 160 : 120,
        id_linea: linea?.id_linea ?? null, id_parqueo: parqueo.id_parqueo,
      }));
    }
  }

  // ---- Línea 4: San José Pinula -> Santa Catarina Pinula -> Condado Concepción -> Zona Pradera -> Zona 10 -> Obelisco -> Trébol ----
  // Coordenadas y distancias aproximadas (demostración); se pueden corregir desde la aplicación.
  const [sjp, scp]: any[] = await Municipalidad.bulkCreate([{ nombre: 'San José Pinula' }, { nombre: 'Santa Catarina Pinula' }], { returning: true });
  const eSjp = await est('San José Pinula', sjp, 14.545, -90.411, [['Acceso principal', ['Erick Boj']]]);
  const eScp = await est('Santa Catarina Pinula', scp, 14.571, -90.49, [['Acceso principal', ['Marta Cho']]]);
  const eCondado = await est('Condado Concepción', scp, 14.5985, -90.49, [['Acceso único', ['Danilo Ixcot']]]);
  const ePradera = await est('Zona Pradera', gt, 14.601, -90.5, [['Acceso A', ['Silvia Ajú']]]);
  const eZona10 = await est('Zona 10', gt, 14.6055, -90.512, [['Acceso norte', ['Néstor Pu']], ['Acceso sur', ['Reyna Tax']]]);
  const eObelisco = await est('Obelisco', gt, 14.603, -90.52, [['Acceso único', ['Alex Quej']]]);

  const l4: any = await Linea.create({ nombre: 'Línea 4 San José Pinula', id_municipalidad: sjp.id_municipalidad });
  await reemplazarParadas(l4.id_linea, [
    { id_estacion: eSjp.id_estacion, distancia_a_siguiente_km: 11.7 },
    { id_estacion: eScp.id_estacion, distancia_a_siguiente_km: 4.0 },
    { id_estacion: eCondado.id_estacion, distancia_a_siguiente_km: 1.4 },
    { id_estacion: ePradera.id_estacion, distancia_a_siguiente_km: 1.8 },
    { id_estacion: eZona10.id_estacion, distancia_a_siguiente_km: 1.2 },
    { id_estacion: eObelisco.id_estacion, distancia_a_siguiente_km: 1.1 },
    { id_estacion: trebol.id_estacion, distancia_a_siguiente_km: 0 }, // Trébol: estación compartida con las líneas 1, 2 y 3
  ]);
  const p4: any = await Parqueo.create({ nombre: 'Parqueo San José Pinula', capacidad: 10, id_estacion: eSjp.id_estacion });
  for (let i = 0; i < 7; i++) { // 7 estaciones: mínimo 7 y máximo 14 buses
    await Bus.create({ placa: `TM-${114 + i}`, capacidad_maxima: i % 2 ? 160 : 120, id_linea: l4.id_linea, id_parqueo: p4.id_parqueo });
  }

  // Horarios de servicio iniciales (editables desde el panel del administrador)
  const franjas = (lv: [string, string], sab: [string, string], dom: [string, string]) => [
    ['LUNES_VIERNES', lv], ['SABADO', sab], ['DOMINGO_FESTIVOS', dom],
  ] as const;
  const horarios: [any, ReturnType<typeof franjas>][] = [
    [l1, franjas(['05:00', '20:00'], ['05:00', '19:00'], ['06:30', '19:00'])],
    [l2, franjas(['05:30', '20:00'], ['05:30', '19:00'], ['06:30', '19:00'])],
    [l3, franjas(['05:00', '21:00'], ['05:00', '20:00'], ['06:00', '20:00'])],
    [l4, franjas(['05:00', '21:00'], ['05:00', '20:00'], ['06:00', '20:00'])],
  ];
  for (const [linea, fr] of horarios) {
    await HorarioLinea.bulkCreate(fr.map(([tipo_dia, [i, f]]) => ({ id_linea: linea.id_linea, tipo_dia, hora_inicio: i, hora_fin: f })));
  }

  const nombres = ['Marvin Choc', 'Edwin Tojín', 'Brenda Lux', 'Óscar Pop', 'Karina Alvarado', 'Rubén Cifuentes', 'Gladys Menchú', 'Tomás Rax'];
  for (let i = 0; i < nombres.length; i++) {
    await Piloto.create({
      nombre: nombres[i], historial_educativo: i % 2 ? 'Bachiller en Computación; curso de conducción profesional' : 'Perito Contador; licencia tipo A',
      direccion_residencia: `Zona ${i + 3}, Ciudad de Guatemala`, telefono: `5555-01${10 + i}`,
      email: `piloto${i + 1}@transmetro.gt`, id_bus: buses[i].id_bus,
    });
  }

  await Operador.create({ nombre: 'Operador Centra Norte', usuario: 'operador.centra', id_estacion: centra.id_estacion });
  const h = (p: string) => bcrypt.hash(p, 10);
  const pasajero: any = await Usuario.create({ nombre: 'Pasajero de Prueba', email: 'pasajero@transmetro.gt', password_hash: await h('Pasajero123!'), rol: 'pasajero' });
  await TarjetaAcceso.bulkCreate([
    { numero: 'TM-0001-2026', saldo: 25, id_usuario: pasajero.id_usuario }, { numero: 'TM-0002-2026', saldo: 0.5 }, { numero: 'TM-0003-2026', saldo: 100 },
  ]);
  await Usuario.bulkCreate([
    { nombre: 'Administrador Central', email: 'admin@transmetro.gt', password_hash: await h(process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!'), rol: 'admin' },
    { nombre: 'Personal Muni Guatemala', email: 'municipal@transmetro.gt', password_hash: await h('Muni12345!'), rol: 'municipal', id_municipalidad: gt.id_municipalidad },
    { nombre: 'Operador Centra Norte', email: 'operador@transmetro.gt', password_hash: await h('Oper12345!'), rol: 'operador', id_estacion: centra.id_estacion },
    { nombre: 'Guardia Centra Norte', email: 'guardia@transmetro.gt', password_hash: await h('Guardia123!'), rol: 'guardia', id_estacion: centra.id_estacion },
  ]);

  // Datos de demostración de finanzas y demanda (no se cargan en las pruebas automáticas, que parten de cero)
  if (process.env.NODE_ENV !== 'test') {
    try {
      await sembrarFinanzasDemo();
    } catch (e: any) {
      // El sistema funciona sin estos datos; solo los dashboards de finanzas y demanda quedarían vacíos.
      console.warn('No se pudieron cargar los datos de demostración de finanzas y demanda:', e?.message ?? e);
    }
  }
  console.log('Datos de demostración cargados.\n  admin@transmetro.gt / Admin123!\n  municipal@transmetro.gt / Muni12345!\n  operador@transmetro.gt / Oper12345!\n  guardia@transmetro.gt / Guardia123!\n  pasajero@transmetro.gt / Pasajero123!');
}

// Se ejecuta solo con `npm run seed`; al importarlo desde las pruebas no hace nada por sí solo.
if (/seed\.(ts|js)$/.test(process.argv[1] ?? '')) {
  sembrar()
    .then(() => sequelize.close())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
