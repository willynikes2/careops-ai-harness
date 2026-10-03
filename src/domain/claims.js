import { errors } from '../http/errors.js';
import { newId } from '../util/ids.js';

export const CLAIM_TRANSITIONS = Object.freeze({
  SUBMITTED: ['PAID', 'DENIED', 'PENDING_INFO'], PENDING_INFO: ['SUBMITTED'], DENIED: ['APPEALED', 'RESUBMITTED', 'CLOSED'],
  APPEALED: ['PAID', 'DENIED'], RESUBMITTED: ['PAID', 'DENIED'], PAID: ['CLOSED'], CLOSED: [],
});
export const TASK_KINDS = ['AUTH_DOCUMENTATION', 'CODING_REVIEW', 'PAYER_CALL', 'APPEAL_PREP'];
const SELECT = 'SELECT c.*, p.name patient_name FROM claims c JOIN patients p ON p.id = c.patient_id';
const shape = (c) => c && ({ id: c.id, patientName: c.patient_name, payer: c.payer, amountCents: c.amount_cents, serviceDate: c.service_date, status: c.status, denialCode: c.denial_code, denialReason: c.denial_reason });
const taskShape = (t) => ({ id: t.id, claimId: t.claim_id, kind: t.kind, note: t.note, status: t.status, createdBy: t.created_by, createdAt: t.created_at });
export const listAssignedClaims = (db, user) => db.prepare(`${SELECT} WHERE c.assigned_to = ? ORDER BY c.id`).all(user.id).map(shape);
// Unassigned and nonexistent claims look identical to the caller: existence is not revealed.
export const getAssignedClaim = (db, user, id) => shape(db.prepare(`${SELECT} WHERE c.id = ? AND c.assigned_to = ?`).get(String(id).toUpperCase(), user.id)) ?? null;
export const listTasks = (db, claimId) => db.prepare('SELECT * FROM billing_tasks WHERE claim_id = ? ORDER BY created_at DESC').all(claimId).map(taskShape);
const mustGet = (db, user, id) => { const c = getAssignedClaim(db, user, id); if (!c) throw errors.notFound('Claim not found.'); return c; };

export function createFollowup(db, { user, claimId, kind, note, clock }) {
  if (!TASK_KINDS.includes(kind)) throw errors.invalid(`kind must be one of ${TASK_KINDS.join(', ')}.`);
  if (!note || note.length > 500) throw errors.invalid('A one-sentence note (max 500 chars) is required.');
  const c = mustGet(db, user, claimId); const id = newId('task');
  db.prepare("INSERT INTO billing_tasks (id, claim_id, kind, note, status, created_by, created_at) VALUES (?,?,?,?,'OPEN',?,?)").run(id, c.id, kind, note, user.id, clock.now().toISOString());
  return taskShape(db.prepare('SELECT * FROM billing_tasks WHERE id = ?').get(id));
}
export function transitionClaim(db, { user, claimId, to }) {
  const c = mustGet(db, user, claimId);
  const allowed = CLAIM_TRANSITIONS[c.status] ?? [];
  if (!allowed.includes(to)) throw errors.conflict(`A ${c.status} claim can't move to ${to}. Allowed next steps: ${allowed.join(', ') || 'none'}.`);
  db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(to, c.id);
  return getAssignedClaim(db, user, c.id);
}
