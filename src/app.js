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
import { createBudget } from './llm/budget.js';
import { createHarness } from './harness/pipeline.js';
import { loadPrompts } from './harness/prompts.js';
import { chatRoutes } from './routes/chat.js';
import { ptoRoutes } from './routes/pto.js';
import { claimRoutes } from './routes/claims.js';
import { adminRoutes } from './routes/admin.js';
import { labRoutes } from './routes/labs.js';

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
  const budget = createBudget(db, clock, config.dailyBudgetUsd);
  app.use(healthRoutes({ db, kb, config, budget, clock }));
  app.use('/api/auth', authRoutes({ db, clock, config, audit }));
  app.use('/api', requireUser({ db, clock }));
  const prompts = loadPrompts();
  const harness = createHarness({ db, kb, provider, clock, audit, budget, prompts, config });
  app.use('/api', chatRoutes({ db, clock, audit, harness, config }));
  app.use('/api', ptoRoutes({ db, clock, audit }), claimRoutes({ db, clock, audit }), adminRoutes({ db, clock, audit, config }));
  app.use('/api', labRoutes({ db, kb, provider, prompts, harness, budget, config, audit }));
  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'Not found.')));
  app.use(express.static(WEB_DIR, { extensions: ['html'] }));
  app.use(errorHandler(logger));
  return { app, audit, harness };
}
