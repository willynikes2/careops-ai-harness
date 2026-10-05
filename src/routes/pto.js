import { Router } from 'express';
import { z } from 'zod';
import { parseBody, requireRole } from '../http/middleware.js';
import { createPtoRequest, decidePtoRequest, listApprovals, listMyPto } from '../domain/pto.js';
import { withIdempotency } from '../domain/idempotency.js';

const NewReq = z.object({ date: z.string(), hours: z.number().optional(), idempotencyKey: z.string().min(1).max(100) });
const Decision = z.object({ decision: z.enum(['APPROVED', 'DENIED']), idempotencyKey: z.string().min(1).max(100) });

export function ptoRoutes({ db, clock, audit }) {
  const r = Router();
  const ptoUsers = requireRole('employee', 'manager', 'billing');
  r.get('/pto/me', ptoUsers, (req, res) => res.json(listMyPto(db, req.user)));
  r.post('/pto/requests', ptoUsers, (req, res) => {
    const b = parseBody(NewReq, req.body);
    const out = withIdempotency(db, { key: b.idempotencyKey, userId: req.user.id, scope: 'pto:create', body: { date: b.date, hours: b.hours ?? 8 } }, () => {
      const created = createPtoRequest(db, { user: req.user, date: b.date, hours: b.hours ?? 8, clock });
      audit.event({ actor: req.user, kind: 'pto_requested', detail: { requestId: created.id, date: created.date, via: 'form' } });
      return created;
    });
    res.status(201).json(out);
  });
  r.get('/pto/approvals', requireRole('manager'), (req, res) => res.json({ requests: listApprovals(db, req.user) }));
  r.post('/pto/requests/:id/decision', requireRole('manager'), (req, res) => {
    const b = parseBody(Decision, req.body);
    res.json(withIdempotency(db, { key: b.idempotencyKey, userId: req.user.id, scope: `pto:decide:${req.params.id}`, body: { decision: b.decision } }, () => {
      const d = decidePtoRequest(db, { manager: req.user, requestId: req.params.id, decision: b.decision, clock });
      audit.event({ actor: req.user, kind: 'pto_decided', detail: { requestId: d.id, decision: d.status, employee: d.employeeName } });
      return d;
    }));
  });
  return r;
}
