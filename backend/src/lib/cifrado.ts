import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

// Cifrado de datos personales en reposo (RNF-3): AES-256-GCM con IV aleatorio por dato.
const clave = createHash('sha256').update(env.DATOS_CLAVE).digest(); // 32 bytes

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

export function descifrar(valor: string): string {
  const [iv, tag, datos] = valor.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', clave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}

// Huella determinista (HMAC) para detectar duplicados sin guardar el dato en claro.
export const huella = (texto: string) => createHmac('sha256', clave).update(texto).digest('hex');

// Muestra solo los últimos 4 caracteres.
export const enmascarar = (t: string) => (t.length <= 4 ? '••••' : '•'.repeat(t.length - 4) + t.slice(-4));
