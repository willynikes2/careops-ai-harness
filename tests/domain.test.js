import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { seedDb } from '../src/db/seed.js';
import { fixedClock } from '../src/util/clock.js';
import { resolvePtoDate } from '../src/util/dates.js';
import { createPtoRequest, decidePtoRequest, getBalance } from '../src/domain/pto.js';
import { transitionClaim, getAssignedClaim, createFollowup } from '../src/domain/claims.js';
import { withIdempotency } from '../src/domain/idempotency.js';

const TUE = new Date('2026-10-06T14:00:00Z'); const SAT = new Date('2026-10-03T14:00:00Z');
const clock = fixedClock('2026-10-06T14:00:00Z');
const world = () => { const db = openDb(); seedDb(db, { clock, demoPassword: 'pw' }); return db; };
const jordan = { id: 'u-jordan', role: 'employee' }; const priya = { id: 'u-priya', role: 'manager' };
const marcus = { id: 'u-marcus', role: 'billing' };

test('"Friday" on a Tuesday is this week', () => assert.deepEqual(resolvePtoDate('Take Friday off', TUE), { kind: 'date', date: '2026-10-09' }));
test('"next Friday" on a Tuesday is ambiguous', () => assert.deepEqual(resolvePtoDate('Take next Friday off.', TUE), { kind: 'ambiguous', phrase: 'next friday', candidates: ['2026-10-09', '2026-10-16'] }));
test('"next Friday" on a Saturday is unambiguous', () => assert.deepEqual(resolvePtoDate('take next friday off', SAT), { kind: 'date', date: '2026-10-09' }));
test('ISO date wins', () => assert.deepEqual(resolvePtoDate('Take 2026-10-16 off.', TUE), { kind: 'date', date: '2026-10-16' }));
test('no date found', () => assert.deepEqual(resolvePtoDate('I want some time off', TUE), { kind: 'none' }));

test('PTO request moves hours to pending; approval deducts', () => {
  const db = world();
  const r = createPtoRequest(db, { user: jordan, date: '2026-10-09', hours: 8, clock });
  assert.equal(r.status, 'PENDING');
  assert.deepEqual(getBalance(db, 'u-jordan'), { hoursAvailable: 40, hoursPending: 8 });
  const d = decidePtoRequest(db, { manager: priya, requestId: r.id, decision: 'APPROVED', clock });
  assert.equal(d.status, 'APPROVED');
  assert.deepEqual(getBalance(db, 'u-jordan'), { hoursAvailable: 32, hoursPending: 0 });
  assert.throws(() => decidePtoRequest(db, { manager: priya, requestId: r.id, decision: 'DENIED', clock }), /already approved/);
});

test('PTO rules: notice, weekend, past, balance, duplicate', () => {
  const db = world();
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2026-10-07', clock }), /2 business days/);
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2026-10-10', clock }), /weekend/);
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2026-10-01', clock }), /future/);
  createPtoRequest(db, { user: jordan, date: '2026-10-09', clock });
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2026-10-09', clock }), /already have/);
  db.prepare("UPDATE pto_balances SET hours_available = 8 WHERE user_id='u-jordan'").run();
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2026-10-12', clock }), /Not enough PTO/);
});

test('a manager cannot decide someone else\'s report', () => {
  const db = world();
  const r = createPtoRequest(db, { user: { id: 'u-marcus', role: 'billing' }, date: '2026-10-09', clock });
  assert.throws(() => decidePtoRequest(db, { manager: priya, requestId: r.id, decision: 'APPROVED', clock }), /not found/);
});

test('claim state machine rejects DENIED → PAID', () => {
  const db = world();
  assert.throws(() => transitionClaim(db, { user: marcus, claimId: 'CLM-1004', to: 'PAID' }), /can't move to PAID.*APPEALED, RESUBMITTED, CLOSED/);
  assert.equal(transitionClaim(db, { user: marcus, claimId: 'CLM-1004', to: 'RESUBMITTED' }).status, 'RESUBMITTED');
});

test('unassigned claims are invisible', () => {
  const db = world();
  assert.equal(getAssignedClaim(db, marcus, 'CLM-1007'), null);
  assert.equal(getAssignedClaim(db, marcus, 'CLM-9999'), null);
  assert.throws(() => createFollowup(db, { user: marcus, claimId: 'CLM-1007', kind: 'PAYER_CALL', note: 'x', clock }), /not found/);
});

test('idempotency replays the first result', () => {
  const db = world(); let n = 0;
  const a = withIdempotency(db, { key: 'k1', userId: 'u', scope: 's' }, () => ({ n: ++n }));
  const b = withIdempotency(db, { key: 'k1', userId: 'u', scope: 's' }, () => ({ n: ++n }));
  assert.deepEqual(a, { n: 1 }); assert.deepEqual(b, { n: 1 }); assert.equal(n, 1);
});

test('impossible calendar dates are rejected, not rolled over', () => {
  const db = world();
  assert.throws(() => createPtoRequest(db, { user: jordan, date: '2027-02-30', clock }), /valid date/);
});
test('requested hours: digits, number words, half and full days', async () => {
  const { requestedHours } = await import('../src/util/dates.js');
  for (const [t, h] of [['for 4 hours', 4], ['for four hours', 4], ['six hrs', 6], ['a half day', 4], ['half-day', 4], ['two and a half hours', 2.5], ['an hour', 1], ['next Friday', null], ['a full day', 8]]) assert.equal(requestedHours(t), h, t);
});
