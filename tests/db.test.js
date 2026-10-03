import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';

test('openDb creates every table', () => {
  const db = openDb(':memory:');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  for (const t of ['audit_events', 'billing_tasks', 'claims', 'idempotency_keys', 'lab_results', 'llm_calls',
    'patients', 'pending_actions', 'pto_balances', 'pto_requests', 'sessions', 'traces', 'users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('foreign keys are enforced', () => {
  const db = openDb(':memory:');
  assert.throws(() => db.prepare("INSERT INTO sessions (id,user_id,csrf,expires_at) VALUES ('s','nope','c',1)").run());
});
