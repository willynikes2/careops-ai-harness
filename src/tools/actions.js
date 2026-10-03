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

export function confirmAction(db, { user, actionId, clock, audit }) {
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(actionId);
    if (!row || row.user_id !== user.id) throw errors.notFound('Action not found.');
    if (row.status !== 'PROPOSED') return JSON.parse(row.result_json); // idempotent replay
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
    audit.event({ actor: user, kind: out.status === 'EXECUTED' ? 'action_executed' : 'action_rejected', turnId: row.turn_id, detail: { actionId: row.id, tool: row.tool, message: out.message } });
    if (out.status === 'EXECUTED' && row.tool === 'create_pto_request') audit.event({ actor: user, kind: 'pto_requested', turnId: row.turn_id, detail: { requestId: out.result.id, date: out.result.date, via: 'assistant' } });
    return out;
  })();
}
