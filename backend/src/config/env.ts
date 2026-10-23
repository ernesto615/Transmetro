import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().default('postgres://transmetro:transmetro@localhost:5432/transmetro_db'),
  JWT_SECRET: z.string().min(16).default('cambia-este-secreto-por-uno-largo-y-aleatorio'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Clave para cifrar datos personales (DPI, NIT). En producción debe ser larga, aleatoria y secreta.
  DATOS_CLAVE: z.string().min(16).default('clave-de-desarrollo-cambiela-en-produccion'),
});

export const env = schema.parse(process.env);

// En producción es obligatorio definir secretos propios: los valores por defecto son públicos.
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.DATOS_CLAVE)) {
  throw new Error('En producción debe definir las variables JWT_SECRET y DATOS_CLAVE con valores largos y secretos.');
}
