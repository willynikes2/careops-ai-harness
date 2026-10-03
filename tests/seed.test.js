import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { openDb } from '../src/db/index.js';
import { seedDb } from '../src/db/seed.js';
import { fixedClock } from '../src/util/clock.js';

const clock = fixedClock('2026-10-06T14:00:00Z');
const count = (db, t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;

test('seed creates the demo world', () => {
  const db = openDb(); seedDb(db, { clock, demoPassword: 'pw' });
  assert.equal(count(db, 'users'), 5);
  assert.equal(count(db, 'claims'), 8);
  const c = db.prepare("SELECT * FROM claims WHERE id='CLM-1004'").get();
  assert.equal(c.status, 'DENIED'); assert.equal(c.denial_code, 'CO-197'); assert.equal(c.assigned_to, 'u-marcus');
  assert.equal(db.prepare("SELECT hours_available h FROM pto_balances WHERE user_id='u-jordan'").get().h, 40);
  const u = db.prepare("SELECT password_hash FROM users WHERE username='jordan'").get();
  assert.ok(bcrypt.compareSync('pw', u.password_hash));
});

test('reseed restores business data but keeps sessions and audit', () => {
  const db = openDb(); seedDb(db, { clock, demoPassword: 'pw' });
  db.prepare("INSERT INTO sessions VALUES ('s1','u-dana','c',9999999999999)").run();
  db.prepare("INSERT INTO audit_events (at,kind,detail_json) VALUES ('x','test','{}')").run();
  db.prepare("UPDATE claims SET status='CLOSED' WHERE id='CLM-1004'").run();
  db.prepare("INSERT INTO billing_tasks VALUES ('t1','CLM-1004','PAYER_CALL','n','OPEN','u-marcus','x')").run();
  seedDb(db, { clock, demoPassword: 'pw' });
  assert.equal(db.prepare("SELECT status FROM claims WHERE id='CLM-1004'").get().status, 'DENIED');
  assert.equal(count(db, 'billing_tasks'), 0);
  assert.equal(count(db, 'sessions'), 1);
  assert.equal(count(db, 'audit_events'), 1);
});
