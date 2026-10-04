import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_ITEMS } from '../src/labs/evalSet.js';
import { scoreTurn, chooseDefault } from '../src/labs/modelLab.js';
import { startTestApp } from './helpers.js';
import { FakeProvider } from '../src/llm/fake.js';

test('12 eval items, all synthetic-world questions', () => assert.equal(EVAL_ITEMS.length, 12));
const item = { id: 'x', expect: { tool: 'create_billing_followup', keyFacts: [['authorization']], mustCite: true } };
test('all five binary criteria pass', () => {
  const s = scoreTurn(item, { status: 'answered', answer: 'Authorization was missing.', citations: [{ docId: '3' }], proposedAction: { tool: 'create_billing_followup' }, _raw: '{"answer":"Authorization was missing."}' });
  assert.equal(s.pass, true); assert.deepEqual(s.failed, []);
});
test('withheld output fails json/citations/key_fact; wrong tool fails expected_action', () => {
  assert.deepEqual(scoreTurn(item, { status: 'invalid_output', answer: '', citations: [], proposedAction: null, _raw: 'nope' }).failed.sort(), ['citations_valid', 'expected_action', 'json_valid', 'key_fact']);
});
test('a fabricated record id fails no_fabricated_ids', () => {
  const s = scoreTurn(item, { status: 'invalid_output', reason: 'referenced records not in the authorized context (CLM-5555)', answer: '', citations: [], proposedAction: null, _raw: '{"answer":"x"}' });
  assert.ok(s.failed.includes('no_fabricated_ids'));
});
test('provider outages are infrastructure errors, not model failures', () => {
  const s = scoreTurn(item, { status: 'ai_unavailable', answer: 'unavailable', citations: [], proposedAction: null, _raw: '' });
  assert.equal(s.infraError, true);
});
test('pass rate excludes infrastructure errors and reports them separately', async () => {
  const { summarizeModel } = await import('../src/labs/modelLab.js');
  const rows = [
    { model: 'm', pass: true, infraError: false, criteria: { json_valid: true }, costUsd: 0.002, latencyMs: 100 },
    { model: 'm', pass: false, infraError: true, criteria: { json_valid: false }, costUsd: 0, latencyMs: 0 },
  ];
  const s = summarizeModel({ id: 'm', label: 'M' }, rows);
  assert.equal(s.total, 1); assert.equal(s.passRate, 1); assert.equal(s.errors, 1); assert.equal(s.avgCostUsd, 0.002);
});
test('default = cheapest model at ≥90%, else best pass rate', () => {
  assert.equal(chooseDefault([{ id: 'a', passRate: 0.95, avgCostUsd: 0.01 }, { id: 'b', passRate: 0.91, avgCostUsd: 0.001 }, { id: 'c', passRate: 0.5, avgCostUsd: 0.0001 }]), 'b');
  assert.equal(chooseDefault([{ id: 'a', passRate: 0.8, avgCostUsd: 0.01 }, { id: 'b', passRate: 0.6, avgCostUsd: 0.001 }]), 'a');
});
test('model lab run persists results and sets the chat default; never mutates business data', async (t) => {
  const provider = new FakeProvider(() => ({ answer: 'ok' }));
  const app = await startTestApp({ provider }); t.after(app.close);
  const { call } = await app.login('dana');
  const r = (await call('/api/labs/models/run', { method: 'POST' })).body;
  assert.equal(r.items, 12); assert.equal(r.models.length, 4); assert.equal(r.rows.length, 12 * 4 * r.reps);
  assert.equal((await call('/api/models')).body.default, r.defaultModel);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM pto_requests').get().n, 1); // only the seeded one
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM billing_tasks').get().n, 0);
});

test('model lab runs on its own seeded data, independent of live state', async (t) => {
  // echo the PTO balance the model is shown; the lab must see the seeded 40 even after live data changed
  const provider = new FakeProvider((req) => {
    const m = req.user.match(/"hoursAvailable":(\d+)/);
    return { answer: m ? `You have ${m[1]} hours.` : 'ok' };
  });
  const app = await startTestApp({ provider }); t.after(app.close);
  app.db.prepare("UPDATE pto_balances SET hours_available = 32 WHERE user_id = 'u-jordan'").run();
  const auditBefore = app.db.prepare('SELECT COUNT(*) n FROM audit_events').get().n;
  const { call } = await app.login('dana');
  const r = (await call('/api/labs/models/run', { method: 'POST' })).body;
  const balanceRows = r.rows.filter(x => x.itemId === 'pto-balance');
  assert.ok(balanceRows.length > 0 && balanceRows.every(x => !x.failed.includes('key_fact')), 'lab saw live balance instead of seeded 40');
  assert.equal(app.db.prepare("SELECT hours_available h FROM pto_balances WHERE user_id = 'u-jordan'").get().h, 32); // live data untouched
  const labAudit = app.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE kind = 'chat_turn'").get().n;
  assert.equal(labAudit, 0, 'lab turns must not flood the live audit log');
  assert.ok(app.db.prepare('SELECT COUNT(*) n FROM audit_events').get().n >= auditBefore);
});
