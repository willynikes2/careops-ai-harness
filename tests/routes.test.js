import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

test('form-based PTO request is idempotent per key', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('jordan');
  const a = await call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'k-1' } });
  const b = await call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'k-1' } });
  assert.equal(a.status, 201); assert.deepEqual(a.body, b.body);
  assert.equal((await call('/api/pto/me')).body.requests.length, 1);
});

test('PTO policy errors are user-readable 400s', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('jordan');
  const r = await call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-07', idempotencyKey: 'k' } });
  assert.equal(r.status, 400); assert.match(r.body.error.message, /2 business days/);
});

test('manager approves; employee sees it; audit shows both', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const jordan = await app.login('jordan'); const priya = await app.login('priya');
  const req = await jordan.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'k' } });
  const d = await priya.call(`/api/pto/requests/${req.body.id}/decision`, { method: 'POST', body: { decision: 'APPROVED', idempotencyKey: 'd1' } });
  assert.equal(d.body.status, 'APPROVED');
  const again = await priya.call(`/api/pto/requests/${req.body.id}/decision`, { method: 'POST', body: { decision: 'APPROVED', idempotencyKey: 'd1' } });
  assert.deepEqual(again.body, d.body);
  assert.equal((await jordan.call('/api/pto/me')).body.requests[0].status, 'APPROVED');
  const dana = await app.login('dana');
  const kinds = (await dana.call('/api/audit')).body.events.map(e => e.kind);
  assert.ok(kinds.includes('pto_requested') && kinds.includes('pto_decided'));
});

test('assistant-confirmed PTO request is audited as pto_requested too', async (t) => {
  const { FakeProvider } = await import('../src/llm/fake.js');
  const provider = new FakeProvider([{ answer: 'Requesting it.', proposed_action: { tool: 'create_pto_request', args: { date: '2026-10-09' } } }]);
  const app = await startTestApp({ provider }); t.after(app.close);
  const jordan = await app.login('jordan');
  const r = await jordan.call('/api/chat', { method: 'POST', body: { message: 'Take 2026-10-09 off.' } });
  await jordan.call(`/api/actions/${r.body.proposedAction.id}/confirm`, { method: 'POST' });
  const dana = await app.login('dana');
  const ev = (await dana.call('/api/audit')).body.events.find(e => e.kind === 'pto_requested');
  assert.equal(ev?.detail.via, 'assistant');
});

test('role boundaries on REST endpoints', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const jordan = await app.login('jordan'); const marcus = await app.login('marcus'); const priya = await app.login('priya');
  assert.equal((await jordan.call('/api/claims')).status, 403);
  assert.equal((await jordan.call('/api/pto/approvals')).status, 403);
  assert.equal((await jordan.call('/api/audit')).status, 403);
  assert.equal((await priya.call('/api/claims')).status, 403);
  assert.equal((await marcus.call('/api/audit')).status, 403);
  assert.equal((await jordan.call('/api/admin/reset', { method: 'POST' })).status, 403);
});

test('claims: unassigned and unknown are both 404; DENIED→PAID is 409', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('marcus');
  assert.equal((await call('/api/claims')).body.claims.length, 7);
  assert.equal((await call('/api/claims/CLM-1007')).status, 404);
  assert.equal((await call('/api/claims/CLM-9999')).status, 404);
  const bad = await call('/api/claims/CLM-1004/transition', { method: 'POST', body: { to: 'PAID' } });
  assert.equal(bad.status, 409); assert.match(bad.body.error.message, /APPEALED, RESUBMITTED, CLOSED/);
  const f = await call('/api/claims/CLM-1004/followups', { method: 'POST', body: { kind: 'AUTH_DOCUMENTATION', note: 'Get auth.', idempotencyKey: 'f1' } });
  assert.equal(f.status, 201);
});

test('admin reset restores data, keeps sessions and audit', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const jordan = await app.login('jordan'); const dana = await app.login('dana');
  await jordan.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'k' } });
  assert.equal((await dana.call('/api/admin/reset', { method: 'POST' })).status, 204);
  assert.equal((await jordan.call('/api/pto/me')).body.requests.length, 0); // jordan still logged in
  const kinds = (await dana.call('/api/audit')).body.events.map(e => e.kind);
  assert.ok(kinds.includes('demo_reset') && kinds.includes('pto_requested'));
});

test('API errors carry a correlation id and never a stack', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('jordan');
  const r = await call('/api/nope');
  assert.equal(r.status, 404); assert.ok(r.body.error.correlationId); assert.ok(!JSON.stringify(r.body).includes('at '));
});

test('a non-numeric audit limit does not break the endpoint', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const dana = await app.login('dana');
  assert.equal((await dana.call('/api/audit?limit=abc')).status, 200);
});

test('chat is also limited per IP address, across sessions', async (t) => {
  const app = await startTestApp({ config: { chatIpLimit: 3 } }); t.after(app.close);
  const a = await app.login('jordan'); const b = await app.login('sam');
  const ask = (s) => s.call('/api/chat', { method: 'POST', body: { message: 'Show me all denied claims.' } });
  const statuses = [await ask(a), await ask(b), await ask(a), await ask(b)].map(r => r.status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test('a manager cannot approve an employee outside their team via the API', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const marcus = await app.login('marcus'); const priya = await app.login('priya');
  const req = await marcus.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'm1' } });
  const d = await priya.call(`/api/pto/requests/${req.body.id}/decision`, { method: 'POST', body: { decision: 'APPROVED', idempotencyKey: 'p1' } });
  assert.equal(d.status, 404);
  assert.equal(app.db.prepare('SELECT status FROM pto_requests WHERE id = ?').get(req.body.id).status, 'PENDING');
});
test('claim status change with the same idempotency key replays instead of failing', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('marcus');
  const a = await call('/api/claims/CLM-1004/transition', { method: 'POST', body: { to: 'APPEALED', idempotencyKey: 'tr-1' } });
  const b = await call('/api/claims/CLM-1004/transition', { method: 'POST', body: { to: 'APPEALED', idempotencyKey: 'tr-1' } });
  assert.equal(a.status, 200); assert.deepEqual(b, a);
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE kind='claim_transition'").get().n, 1);
});

test('an idempotency key replays only the identical request (same resource and body)', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('marcus');
  const first = await call('/api/claims/CLM-1004/followups', { method: 'POST', body: { kind: 'PAYER_CALL', note: 'A', idempotencyKey: 'same' } });
  assert.equal(first.status, 201);
  const replay = await call('/api/claims/CLM-1004/followups', { method: 'POST', body: { kind: 'PAYER_CALL', note: 'A', idempotencyKey: 'same' } });
  assert.deepEqual(replay.body, first.body);
  const otherClaim = await call('/api/claims/CLM-1001/followups', { method: 'POST', body: { kind: 'CODING_REVIEW', note: 'B', idempotencyKey: 'same' } });
  assert.equal(otherClaim.status, 409, 'changed request with a reused key must not return the earlier success');
  const otherNote = await call('/api/claims/CLM-1004/followups', { method: 'POST', body: { kind: 'PAYER_CALL', note: 'changed', idempotencyKey: 'same' } });
  assert.equal(otherNote.status, 409);
  const missing = await call('/api/claims/CLM-9999/followups', { method: 'POST', body: { kind: 'PAYER_CALL', note: 'A', idempotencyKey: 'same' } });
  assert.equal(missing.status, 404, 'a missing claim never replays another claim\'s response');
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM billing_tasks WHERE note IN ('A','B','changed')").get().n, 1);
  const jordan = await app.login('jordan');
  await jordan.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', idempotencyKey: 'p' } });
  assert.equal((await jordan.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-16', idempotencyKey: 'p' } })).status, 409);
  assert.equal((await jordan.call('/api/pto/requests', { method: 'POST', body: { date: '2026-10-09', hours: 4, idempotencyKey: 'p' } })).status, 409);
});

test('REST denials, CSRF failures and cross-owner probes appear in the security audit without secrets', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const jordan = await app.login('jordan'); const marcus = await app.login('marcus');
  const before = app.db.prepare('SELECT COUNT(*) n FROM audit_events WHERE security = 1').get().n;
  assert.equal((await jordan.call('/api/claims')).status, 403);
  assert.equal((await jordan.call('/api/admin/reset', { method: 'POST', csrf: false })).status, 403);
  assert.equal((await jordan.call('/api/traces/turn_someone_elses')).status, 404);
  assert.equal((await jordan.call('/api/actions/act_someone_elses/confirm', { method: 'POST' })).status, 404);
  assert.equal((await fetch(app.base + '/api/claims')).status, 401);
  const rows = app.db.prepare("SELECT * FROM audit_events WHERE security = 1 AND kind = 'api_access_denied' ORDER BY id").all();
  assert.equal(rows.length, 5, 'one sanitized event per denial');
  const details = rows.map(r => JSON.parse(r.detail_json));
  assert.deepEqual(details.map(d => d.status), [403, 403, 404, 404, 401]);
  assert.ok(details.every(d => d.method && d.path && d.correlationId && d.code));
  assert.equal(rows[0].actor_id, 'u-jordan');
  assert.ok(!rows.some(r => /careops_sid|csrf.*[0-9a-f]{16}|cookie/i.test(r.detail_json)), 'no cookies or tokens in the audit');
  assert.ok(app.db.prepare('SELECT COUNT(*) n FROM audit_events WHERE security = 1').get().n > before);
  // repeated identical probes are throttled so the audit cannot be flooded
  for (let i = 0; i < 5; i++) await jordan.call('/api/claims');
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE kind = 'api_access_denied'").get().n, 5);
  assert.equal((await marcus.call('/api/claims')).status, 200);
});

test('the advertised /careops path redirects to the app', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  for (const p of ['/careops', '/careops/', '/careops/app.html']) {
    const r = await fetch(app.base + p, { redirect: 'manual' });
    assert.equal(r.status, 301, p); assert.equal(r.headers.get('location'), '/');
  }
});
