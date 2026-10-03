import { errors } from '../http/errors.js';
import { newId } from '../util/ids.js';
import { nyDate } from '../util/clock.js';
import { isWeekend, businessDaysUntil } from '../util/dates.js';

const SELECT = 'SELECT r.*, u.display_name employee_name, u.manager_id FROM pto_requests r JOIN users u ON u.id = r.user_id';
const shape = (r) => r && ({ id: r.id, userId: r.user_id, employeeName: r.employee_name, date: r.date, hours: r.hours, status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at, createdAt: r.created_at });
export const getPtoRequest = (db, id) => shape(db.prepare(`${SELECT} WHERE r.id = ?`).get(id));
export function getBalance(db, userId) {
  const b = db.prepare('SELECT hours_available, hours_pending FROM pto_balances WHERE user_id = ?').get(userId);
  return b ? { hoursAvailable: b.hours_available, hoursPending: b.hours_pending } : null;
}
export const listMyPto = (db, user) => ({ balance: getBalance(db, user.id) ?? { hoursAvailable: 0, hoursPending: 0 }, requests: db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.date DESC`).all(user.id).map(shape) });
export const listApprovals = (db, manager) => db.prepare(`${SELECT} WHERE u.manager_id = ? ORDER BY r.created_at DESC`).all(manager.id).map(shape);

// PTO Policy rules are enforced here, in code — not by the model.
export function createPtoRequest(db, { user, date, hours = 8, clock }) {
  const today = nyDate(clock.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) throw errors.invalid('Please give a valid date (YYYY-MM-DD).');
  if (date <= today) throw errors.invalid('PTO must be requested for a future date.');
  if (isWeekend(date)) throw errors.invalid(`${date} is a weekend — PTO is only needed for workdays.`);
  if (businessDaysUntil(today, date) < 2) throw errors.invalid('PTO Policy §2 requires at least 2 business days notice.');
  if (!(hours > 0 && hours <= 8)) throw errors.invalid('A PTO request can be at most 8 hours (one full day — PTO Policy §4).');
  return db.transaction(() => {
    const bal = getBalance(db, user.id);
    if (!bal) throw errors.forbidden('You do not have a PTO balance in CareOps.');
    const requestable = bal.hoursAvailable - bal.hoursPending;
    if (requestable < hours) throw errors.invalid(`Not enough PTO: ${requestable} hours requestable after pending requests (PTO Policy §3).`);
    if (db.prepare("SELECT 1 FROM pto_requests WHERE user_id = ? AND date = ? AND status != 'DENIED'").get(user.id, date)) throw errors.conflict(`You already have a PTO request for ${date}.`);
    const id = newId('pto');
    db.prepare("INSERT INTO pto_requests (id, user_id, date, hours, status, created_at) VALUES (?,?,?,?,'PENDING',?)").run(id, user.id, date, hours, clock.now().toISOString());
    db.prepare('UPDATE pto_balances SET hours_pending = hours_pending + ? WHERE user_id = ?').run(hours, user.id);
    return getPtoRequest(db, id);
  })();
}

export function decidePtoRequest(db, { manager, requestId, decision, clock }) {
  if (!['APPROVED', 'DENIED'].includes(decision)) throw errors.invalid('decision must be APPROVED or DENIED.');
  return db.transaction(() => {
    const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(requestId);
    if (!r || r.manager_id !== manager.id) throw errors.notFound('PTO request not found.');
    if (r.status !== 'PENDING') throw errors.conflict(`This request was already ${r.status.toLowerCase()}.`);
    db.prepare('UPDATE pto_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?').run(decision, manager.id, clock.now().toISOString(), requestId);
    if (decision === 'APPROVED') db.prepare('UPDATE pto_balances SET hours_available = hours_available - ?, hours_pending = hours_pending - ? WHERE user_id = ?').run(r.hours, r.hours, r.user_id);
    else db.prepare('UPDATE pto_balances SET hours_pending = hours_pending - ? WHERE user_id = ?').run(r.hours, r.user_id);
    return getPtoRequest(db, requestId);
  })();
}
