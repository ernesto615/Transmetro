// Información publicada por la Municipalidad de Guatemala para los usuarios del Transmetro.
// Fuente: https://muniguate.com/movilidadurbana/transmetro/  (puede cambiar; verifique en el sitio oficial).

export const FUENTE_URL = 'https://muniguate.com/movilidadurbana/transmetro/';

export interface HorarioLinea {
  linea: string;
  fondo: string;
  texto: string;
  ruta?: boolean;
  // lunes a viernes, sábado, domingo y festivos. Si dos días comparten horario se usa el campo combinado.
  lv?: string; sab?: string; dom?: string;
  lvSab?: string;   // lunes a sábado (mismo horario)
  sabDom?: string;  // sábado y domingo (mismo horario)
}

export const HORARIOS: HorarioLinea[] = [
  { linea: '1',  fondo: '#5B2C8F', texto: '#FFFFFF', lv: '5:00 a 20:00', sab: '5:00 a 19:00', dom: '6:30 a 19:00' },
  { linea: '2',  fondo: '#A58BD0', texto: '#12142B', lv: '5:30 a 20:00', sab: '5:30 a 19:00', dom: '6:30 a 19:00' },
  { linea: '6',  fondo: '#F6D80F', texto: '#12142B', lv: '5:00 a 21:00', sab: '5:00 a 20:00', dom: '6:00 a 20:00' },
  { linea: '7',  fondo: '#A7A9AC', texto: '#12142B', lv: '5:00 a 21:00', sab: '5:00 a 20:00', dom: '6:00 a 20:00' },
  { linea: '12', fondo: '#E8541E', texto: '#FFFFFF', lv: '4:30 a 21:00', sabDom: '4:30 a 21:00' },
  { linea: '13', fondo: '#79B929', texto: '#12142B', lv: '5:00 a 21:00', sabDom: '5:00 a 20:00' },
  { linea: '18', fondo: '#0A9BD9', texto: '#FFFFFF', lv: '5:00 a 21:00', sab: '5:00 a 20:00', dom: '6:00 a 20:00' },
  { linea: '5',  fondo: '#1B1B8F', texto: '#FFFFFF', ruta: true, lvSab: '5:30 a 19:00', dom: '6:00 a 18:00' },
];

export const EXPRESO_12 = {
  titulo: 'Servicio EXPRESO de Línea 12',
  estaciones: 'Centra Sur · Trébol · Plaza El Amate',
  lunesViernes: '4:30 a 8:30 hrs y 16:30 a 19:00 hrs',
  sabado: '4:30 a 8:30 hrs y 11:30 a 13:30 hrs',
};

export const NOTA_HORARIOS = 'Los horarios indican el inicio y el final del servicio en las estaciones extremo de la ruta.';

export const PROHIBIDO = [
  'No personas bajo el efecto de sustancias',
  'No material inflamable',
  'No animales, excepto perros guía',
  'No más de un bulto',
  'No saltar de la estación',
  'No armas',
  'No fumar',
  'No sacar la cabeza y extremidades',
  'No alimentos',
  'Tire la basura en su lugar',
];

export const RECOMENDACIONES = [
  'Cuide sus cosas',
  'Puertas automáticas: cuidado con sus manos',
  'Deje salir antes de entrar',
  'Respete la fila',
  'Acceso universal',
];

export const EQUIPAJE = {
  mochilas: { titulo: 'Mochilas', medida: '25 cm x 40 cm x 45 cm', detalle: 'Lleve la mochila o bolsa en la mano desde el ingreso hasta el final del viaje.' },
  maletas: {
    titulo: 'Maletas, bultos y cajas', medida: '25 cm x 40 cm x 60 cm',
    detalle: 'Únicamente de lunes a sábado de 9:30 a 16:00 hrs y los domingos todo el día.',
  },
  nota: 'Solo se permite un equipaje de mano por persona. Para cualquier carga adicional o de mayor tamaño debe utilizar otro medio de transporte.',
};

// Municipios con fondo fotográfico en el menú de acceso. Coloque las fotos en frontend/public/fotos/
export const CIUDADES = [
  { archivo: '/fotos/ciudad-de-guatemala.jpg', nombre: 'Ciudad de Guatemala' },
  { archivo: '/fotos/mixco.jpg', nombre: 'Mixco' },
  { archivo: '/fotos/villa-nueva.jpg', nombre: 'Villa Nueva' },
  { archivo: '/fotos/san-jose-pinula.jpg', nombre: 'San José Pinula' },
];
