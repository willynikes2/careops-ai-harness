import { Router } from 'express';
import { requireRole } from '../http/middleware.js';
import { errors } from '../http/errors.js';
import { runAttackLab } from '../labs/attackLab.js';
import { getDefaultModel } from '../harness/pipeline.js';

const stored = (db, lab) => { const r = db.prepare('SELECT results_json FROM lab_results WHERE lab = ?').get(lab); return r ? JSON.parse(r.results_json) : null; };
export function labRoutes({ db, harness, budget, config, audit }) {
  const r = Router();
  r.use('/labs', requireRole('admin'));
  r.get('/labs/attacks', (req, res, next) => { const s = stored(db, 'attacks'); return s ? res.json(s) : next(errors.notFound('No Attack Lab run recorded yet.')); });
  r.post('/labs/attacks/run', async (req, res, next) => {
    try {
      if (budget.remaining() < 0.25) throw errors.aiUnavailable('Daily AI budget too low to run the Attack Lab.');
      const out = await runAttackLab({ db, harness, model: getDefaultModel(db, config) });
      audit.event({ actor: req.user, kind: 'lab_run', detail: { lab: 'attacks', summary: out.summary } });
      res.json(out);
    } catch (e) { next(e); }
  });
  return r;
}
