import { newId } from '../util/ids.js';
import { errors, HttpError } from '../http/errors.js';
import { can } from '../policy/permissions.js';
import { getTool } from './registry.js';

export function proposeAction(db, { user, turnId, action, clock }) {
  const id = newId('act');
  db.prepare('INSERT INTO pending_actions (id, user_id, turn_id, tool, args_json, summary, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, user.id, turnId, action.tool, JSON.stringify(action.args), action.summary, clock.now().toISOString());
  return { id, tool: action.tool, summary: action.summary };
}

export const PROPOSAL_TTL_MS = 30 * 60_000;

function ownRow(db, user, actionId) {
  const row = db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(actionId);
  if (!row || row.user_id !== user.id) throw errors.notFound('Action not found.');
  return row;
}
// Ends a proposal without running it; later confirms replay this outcome. Recorded as a security event.
function close(db, row, status, message) {
  const out = { id: row.id, tool: row.tool, status, result: {}, message };
  db.prepare('UPDATE pending_actions SET status = ?, result_json = ? WHERE id = ?').run(status, JSON.stringify(out), row.id);
  return out;
}

export function dismissAction(db, { user, actionId, audit }) {
  return db.transaction(() => {
    const row = ownRow(db, user, actionId);
    if (row.status !== 'PROPOSED') throw errors.conflict(`This action was already ${row.status.toLowerCase()}.`);
    const out = close(db, row, 'CANCELLED', 'You dismissed this action, so it will not run.');
    const auditId = audit.event({ actor: user, kind: 'action_dismissed', turnId: row.turn_id, detail: { actionId: row.id, tool: row.tool } });
    audit.updateDecision(row.turn_id, { execution: 'CANCELLED', stateChange: 'None — dismissed by the user' }, { event: 'CANCELLED', auditId });
    return out;
  })();
}

export function confirmAction(db, { user, actionId, clock, audit }) {
  return db.transaction(() => {
    const row = ownRow(db, user, actionId);
    if (row.status !== 'PROPOSED') {
      const prior = JSON.parse(row.result_json);
      if (prior.status === 'CANCELLED' || prior.status === 'EXPIRED') audit.event({ actor: user, kind: 'action_refused', security: true, turnId: row.turn_id, detail: { actionId: row.id, tool: row.tool, reason: prior.status } });
      return prior; // idempotent replay
    }
    if (clock.now().getTime() - Date.parse(row.created_at) > PROPOSAL_TTL_MS) {
      const out = close(db, row, 'EXPIRED', 'This proposal expired (older than 30 minutes). Ask again to get a fresh one.');
      const auditId = audit.event({ actor: user, kind: 'action_refused', security: true, turnId: row.turn_id, detail: { actionId: row.id, tool: row.tool, reason: 'EXPIRED' } });
      audit.updateDecision(row.turn_id, { execution: 'EXPIRED', stateChange: 'None — proposal expired' }, { event: 'EXPIRED', auditId });
      return out;
    }
    const tool = getTool(row.tool);
    let out;
    try {
      if (!tool || !can(user, tool.permission)) throw errors.forbidden('You are not allowed to run this action.'); // re-check at execution time
      const result = tool.execute({ db, user, args: JSON.parse(row.args_json), clock });
      out = { id: row.id, tool: row.tool, status: 'EXECUTED', result, message: tool.resultMessage(result) };
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      out = { id: row.id, tool: row.tool, status: 'REJECTED', result: {}, message: err.message };
    }
    db.prepare('UPDATE pending_actions SET status = ?, result_json = ? WHERE id = ?').run(out.status, JSON.stringify(out), row.id);
    const executionAuditId = audit.event({ actor: user, kind: out.status === 'EXECUTED' ? 'action_executed' : 'action_rejected', turnId: row.turn_id, detail: { actionId: row.id, tool: row.tool, message: out.message } });
    audit.updateDecision(row.turn_id, { execution: out.status === 'EXECUTED' ? 'SUCCESS' : 'REJECTED', stateChange: out.status === 'EXECUTED' ? tool.stateChange(out.result) : `None — ${out.message}`, executionAuditId }, { event: out.status, auditId: executionAuditId });
    if (out.status === 'EXECUTED' && row.tool === 'create_pto_request') audit.event({ actor: user, kind: 'pto_requested', turnId: row.turn_id, detail: { requestId: out.result.id, date: out.result.date, via: 'assistant' } });
    return out;
  })();
}
