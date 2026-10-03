import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler, parseBody } from '../http/middleware.js';
import { errors } from '../http/errors.js';
import { confirmAction } from '../tools/actions.js';
import { MODELS, isKnownModel } from '../llm/models.js';
import { getDefaultModel } from '../harness/pipeline.js';

const ChatBody = z.object({ message: z.string().trim().min(1).max(2000), model: z.string().max(100).optional() });
const publicTurn = ({ _raw, reason, ...turn }) => turn; // raw model text and rejection reason stay server-side (both are in the trace)

export function chatRoutes({ db, clock, audit, harness, config }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, keyGenerator: (req) => req.session.sessionId, validate: false, handler: (req, res, next) => next(errors.rateLimited()) });
  r.post('/chat', limiter, asyncHandler(async (req, res) => {
    const { message, model } = parseBody(ChatBody, req.body);
    if (model && !isKnownModel(model)) throw errors.invalid('Unknown model.');
    res.json(publicTurn(await harness.runTurn({ user: req.user, message, model: model ?? getDefaultModel(db, config) })));
  }));
  r.post('/actions/:id/confirm', (req, res) => res.json({ action: confirmAction(db, { user: req.user, actionId: req.params.id, clock, audit }) }));
  r.get('/traces/:turnId', (req, res, next) => {
    const t = audit.getTrace(req.params.turnId);
    if (!t || (t.user.id !== req.user.id && req.user.role !== 'admin')) return next(errors.notFound('Trace not found.'));
    res.json(t);
  });
  r.get('/models', (req, res) => res.json({ default: getDefaultModel(db, config), models: MODELS }));
  return r;
}
