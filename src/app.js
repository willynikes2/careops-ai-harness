import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { errorHandler, HttpError } from './http/errors.js';
import { correlationId, requireUser } from './http/middleware.js';
import { authRoutes } from './auth/routes.js';
import { healthRoutes } from './routes/health.js';
import { createAudit } from './audit/audit.js';
import { systemClock } from './util/clock.js';

const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));

export function createApp({ db, kb, provider, clock = systemClock, config, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] } } }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(correlationId);
  const audit = createAudit(db, clock);
  app.use(healthRoutes({ db, kb, config }));
  app.use('/api/auth', authRoutes({ db, clock, config, audit }));
  app.use('/api', requireUser({ db, clock }));
  // ROUTERS: chat, pto, claims, admin, labs are mounted here in Tasks 10–15
  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'Not found.')));
  app.use(express.static(WEB_DIR, { extensions: ['html'] }));
  app.use(errorHandler(logger));
  return { app, audit };
}
