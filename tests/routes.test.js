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
