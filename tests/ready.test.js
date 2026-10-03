import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { fakeKb } from './fixtures/kb.js';

test('ready when everything is up', async (t) => {
  const app = await startTestApp(); t.after(app.close);
  const r = await (await fetch(`${app.base}/ready`)).json();
  assert.equal(r.status, 'ready');
});
test('degraded (not down) when KB or provider config is missing', async (t) => {
  const app = await startTestApp({ kb: fakeKb(undefined, { down: true }), config: { openrouterKey: '' } }); t.after(app.close);
  const res = await fetch(`${app.base}/ready`); const r = await res.json();
  assert.equal(res.status, 200); assert.equal(r.status, 'degraded');
  assert.deepEqual(r.checks, { database: 'ok', knowledge: 'down', config: 'ok', reasoningProvider: 'unconfigured' });
});
