// Se ejecuta antes de cada archivo de prueba.
// Las pruebas de integración BORRAN y recrean las tablas, así que SOLO corren contra una base de pruebas.
const url = process.env.TEST_DATABASE_URL ?? 'postgres://transmetro:transmetro@localhost:5432/transmetro_test';

if (!/test/i.test(new URL(url).pathname)) {
  throw new Error(`Por seguridad, la base de pruebas debe llevar "test" en su nombre. Recibido: ${url}`);
}
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-automaticas';
