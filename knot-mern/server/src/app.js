import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// In production the API also serves the built React app from the same origin. By default this is the
// original Knot UI: the root project's build (`npm run build` in the repository root, output in dist/).
// Set CLIENT_DIST to serve a different build.
export const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(here, '../../../dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  const windowMs = 15 * 60 * 1000;
  app.use(
    '/api',
    rateLimit({
      windowMs,
      limit: env.isTest ? 100000 : env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a few minutes and try again.' },
    }),
  );
  // Only password attempts count here. Restoring a session (GET /api/auth/me) and successful
  // sign-ins must not use up the budget, or a few page loads lock everyone out of sign-in.
  const signInLimit = rateLimit({
    windowMs,
    limit: env.isTest ? 100000 : 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many sign-in attempts. Please wait a few minutes.' },
  });
  app.use('/api/auth/login', signInLimit);
  app.use('/api/auth/register', signInLimit);

  app.use('/api', apiRouter);
  app.use('/api', notFoundHandler);

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
