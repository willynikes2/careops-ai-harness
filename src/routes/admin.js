import { Router } from 'express';
import { requireRole } from '../http/middleware.js';
import { seedDb } from '../db/seed.js';

export function adminRoutes({ db, clock, audit, config }) {
  const r = Router();
  r.get('/audit', requireRole('admin'), (req, res) => res.json({ events: audit.list({ securityOnly: req.query.security === '1', limit: Number(req.query.limit ?? 100) }) }));
  r.post('/admin/reset', requireRole('admin'), (req, res) => {
    seedDb(db, { clock, demoPassword: config.demoPassword });
    audit.event({ actor: req.user, kind: 'demo_reset' });
    res.status(204).end();
  });
  return r;
}
