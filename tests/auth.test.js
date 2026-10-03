import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

test('login, me, logout; wrong password is 401 and audited', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const bad = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'jordan', password: 'nope' }) });
  assert.equal(bad.status, 401);
  const { user, call } = await app.login('jordan');
  assert.equal(user.role, 'employee');
  assert.equal((await call('/api/auth/me')).body.user.username, 'jordan');
  assert.equal((await call('/api/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await call('/api/auth/me')).status, 401);
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE kind='login_failed' AND security=1").get().n, 1);
});

test('POST without CSRF token is rejected', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const { call } = await app.login('jordan');
  const r = await call('/api/auth/logout', { method: 'POST', csrf: false });
  assert.equal(r.status, 403);
});

test('unauthenticated API call is 401; client cannot claim a role', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const r = await fetch(`${app.base}/api/auth/me`, { headers: { 'x-role': 'admin' } });
  assert.equal(r.status, 401);
});

test('health is public and ok', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const r = await fetch(`${app.base}/health`);
  assert.deepEqual(await r.json(), { status: 'ok' });
});

test('security headers are set', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const r = await fetch(`${app.base}/health`);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('malformed JSON body is a 400, not a 500', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const r = await fetch(`${app.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username": ' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'invalid_request');
});
