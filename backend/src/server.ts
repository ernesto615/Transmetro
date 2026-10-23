import http from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { sequelize, Usuario } from './db.js';
import { sembrar } from './seed.js';
import { initRealtime } from './realtime.js';

async function main() {
  await sequelize.authenticate();
  // En desarrollo el esquema se ajusta solo (alter). En producción solo se crean las tablas que falten;
  // para cambios de estructura use migraciones versionadas o vuelva a ejecutar `npm run seed` (borra los datos).
  await sequelize.sync(process.env.NODE_ENV === 'production' ? {} : { alter: true });
  // AUTO_SEED=true: si la base está vacía, carga los datos de demostración al arrancar (útil en la nube).
  if (process.env.AUTO_SEED === 'true' && (await Usuario.count()) === 0) {
    console.log('Base vacía: cargando datos de demostración…');
    await sembrar();
  }
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(env.PORT, () => console.log(`API Transmetro en http://localhost:${env.PORT}  (docs: README)`));
}

main().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e.message);
  process.exit(1);
});
