import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { api } from './routes/index.js';
import { errorHandler } from './lib/http.js';

export const app = express();
// Detrás del proxy de la nube, la IP real del visitante viene en X-Forwarded-For; sin esto el limitador vería una sola IP para todos.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'connect-src': ["'self'", 'ws:', 'wss:'], // Socket.IO (tiempo real)
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'], // mosaicos del mapa
      'upgrade-insecure-requests': null, // permite probar la versión compilada también por http://localhost
    },
  },
  // Helmet manda "no-referrer" por defecto y OpenStreetMap bloquea (403 "Access blocked") los mosaicos pedidos sin Referer.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '200kb' }));
app.use(morgan('dev'));
app.get('/health', (_req, res) => res.json({ ok: true, servicio: 'transmetro-api' }));
app.use('/api', api);

// En producción el mismo servidor entrega la aplicación web (carpeta frontend/dist), así no hay CORS ni dos servicios.
const dist = path.resolve(process.cwd(), process.env.FRONTEND_DIST ?? '../frontend/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(dist, 'index.html')); // rutas de React como /registro o /alertas
  });
}

app.use(errorHandler);
