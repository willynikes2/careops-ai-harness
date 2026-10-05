import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/index.js';
import { seedDb } from '../src/db/seed.js';
import { fixedClock } from '../src/util/clock.js';
import { createAudit } from '../src/audit/audit.js';
import { validateProposal } from '../src/tools/registry.js';
import { proposeAction, confirmAction, dismissAction } from '../src/tools/actions.js';

const clock = fixedClock('2026-10-06T14:00:00Z');
const world = () => { const db = openDb(); seedDb(db, { clock, demoPassword: 'pw' }); return { db, audit: createAudit(db, clock) }; };
const jordan = { id: 'u-jordan', role: 'employee' }; const marcus = { id: 'u-marcus', role: 'billing' };
const ptoFacts = { ptoDateCandidates: ['2026-10-09'] };
const billFacts = { claims: [{ id: 'CLM-1004' }] };

test('invented tool is rejected', () => {
  const r = validateProposal({ proposal: { tool: 'grant_admin_role', args: {} }, user: jordan, intent: 'general', facts: {} });
  assert.equal(r.ok, false); assert.match(r.reason, /not in registry/);
});
test('prototype keys are not tools', () => assert.equal(validateProposal({ proposal: { tool: 'constructor', args: {} }, user: jordan, intent: 'general', facts: {} }).ok, false));
test('tool outside role is rejected', () => {
  const r = validateProposal({ proposal: { tool: 'create_billing_followup', args: { claimId: 'CLM-1004', kind: 'PAYER_CALL', note: 'x' } }, user: jordan, intent: 'billing', facts: billFacts });
  assert.match(r.reason, /lacks billing:task:create/);
});
test('model cannot change the date the user asked for', () => {
  const r = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-16' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  assert.match(r.reason, /not the date the user asked for/);
});
test('model cannot reference a claim outside context', () => {
  const r = validateProposal({ proposal: { tool: 'create_billing_followup', args: { claimId: 'CLM-1007', kind: 'PAYER_CALL', note: 'x' } }, user: marcus, intent: 'billing', facts: billFacts });
  assert.match(r.reason, /not in this user's authorized context/);
});
test('extra args are rejected (strict schema)', () => {
  const r = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09', userId: 'u-sam' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  assert.equal(r.ok, false);
});
test('valid proposal → confirm executes once; second confirm replays', () => {
  const { db, audit } = world();
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  assert.equal(v.ok, true);
  const p = proposeAction(db, { user: jordan, turnId: 't1', action: v.action, clock });
  const a = confirmAction(db, { user: jordan, actionId: p.id, clock, audit });
  const b = confirmAction(db, { user: jordan, actionId: p.id, clock, audit });
  assert.equal(a.status, 'EXECUTED'); assert.deepEqual(a, b);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pto_requests WHERE user_id='u-jordan'").get().n, 1);
});
test('another user cannot confirm my action', () => {
  const { db, audit } = world();
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  const p = proposeAction(db, { user: jordan, turnId: 't1', action: v.action, clock });
  assert.throws(() => confirmAction(db, { user: marcus, actionId: p.id, clock, audit }), /not found/);
});
test('business-rule failure at execution is REJECTED, not a crash', () => {
  const { db, audit } = world();
  db.prepare("UPDATE pto_balances SET hours_available = 0 WHERE user_id='u-jordan'").run();
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  const p = proposeAction(db, { user: jordan, turnId: 't1', action: v.action, clock });
  const a = confirmAction(db, { user: jordan, actionId: p.id, clock, audit });
  assert.equal(a.status, 'REJECTED'); assert.match(a.message, /Not enough PTO/);
});
test('a dismissed proposal can no longer be confirmed, and the refusal is audited', () => {
  const { db, audit } = world();
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  const p = proposeAction(db, { user: jordan, turnId: 't1', action: v.action, clock });
  assert.throws(() => dismissAction(db, { user: marcus, actionId: p.id, audit }), /not found/);
  assert.equal(dismissAction(db, { user: jordan, actionId: p.id, audit }).status, 'CANCELLED');
  const a = confirmAction(db, { user: jordan, actionId: p.id, clock, audit });
  assert.equal(a.status, 'CANCELLED'); assert.match(a.message, /dismissed/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pto_requests WHERE user_id='u-jordan'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE kind='action_refused' AND security=1").get().n, 1);
});
test('a proposal expires after 30 minutes', () => {
  const { db, audit } = world();
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  const p = proposeAction(db, { user: jordan, turnId: 't1', action: v.action, clock });
  const later = fixedClock('2026-10-06T14:31:00Z');
  const a = confirmAction(db, { user: jordan, actionId: p.id, clock: later, audit });
  assert.equal(a.status, 'EXPIRED');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pto_requests WHERE user_id='u-jordan'").get().n, 0);
  assert.throws(() => dismissAction(db, { user: jordan, actionId: p.id, audit }), /already/);
});
test('confirmation appends a lifecycle event to the turn decision instead of contradicting it', () => {
  const { db, audit } = world();
  audit.saveTrace({ turnId: 't9', user: jordan, at: clock.now().toISOString(), steps: [], decision: { execution: 'AWAITING CONFIRMATION' } });
  const v = validateProposal({ proposal: { tool: 'create_pto_request', args: { date: '2026-10-09' } }, user: jordan, intent: 'pto_request', facts: ptoFacts });
  const p = proposeAction(db, { user: jordan, turnId: 't9', action: v.action, clock });
  confirmAction(db, { user: jordan, actionId: p.id, clock, audit });
  const d = audit.getTrace('t9').decision;
  assert.equal(d.initialExecution, 'AWAITING CONFIRMATION');
  assert.equal(d.execution, 'SUCCESS');
  assert.equal(d.lifecycle.length, 1); assert.equal(d.lifecycle[0].event, 'EXECUTED'); assert.match(d.lifecycle[0].auditId, /^EVT-/);
});
