import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ungroundedQuantities } from '../src/harness/grounding.js';

// Real answers from stored Model Lab runs (2026-10-05) that a too-strict check withheld. Found by scripts/replay-answers.js.
const PAYER_B = { id: 'pb', title: 'Payer B Provider Manual', collection: 'careops-billing', content: '## §2.1 Incomplete claims (CO-16)\n**Correct and resubmit within 60 days**. Record the correction work in the claim follow-up.' };
const SOP = { id: 'sop', title: 'Claim Denial Management SOP', collection: 'careops-billing', content: 'Claims over **$5,000** are escalated to the **billing supervisor**.' };
const claims = [{ id: 'CLM-1004', amountCents: 325000, status: 'DENIED' }];

test('a claim\'s own amount described as "the claim is $X" is grounded', () => {
  assert.deepEqual(ungroundedQuantities('The claim is $3,250 and does not exceed the $5,000 escalation threshold.', { facts: { claims }, docs: [SOP] }), []);
  assert.deepEqual(ungroundedQuantities('The claim is for $3,250.00 and has status DENIED.', { facts: { claims }, docs: [SOP] }), []);
});
test('punctuation next to a topic word does not hide it', () => {
  assert.deepEqual(ungroundedQuantities('You have 40 hours of PTO available (with 0 hours pending).', { facts: { yourPtoBalance: { hoursAvailable: 40, hoursPending: 0, hoursRequestable: 40 } } }), []);
});
test('a later reference to a number already grounded in the answer passes', () => {
  const answer = 'A CO-16 denial must be corrected and resubmitted within 60 days (§2.1). CLM-1003 was denied with CO-16 for a missing referring provider NPI. The records I have don\'t show the denial date or say what the 60 days counts from, so I can\'t give a calendar date.';
  assert.deepEqual(ungroundedQuantities(answer, { facts: {}, docs: [PAYER_B] }), []);
});
test('cents misread as dollars are still caught, and the reported text has no trailing comma', () => {
  assert.deepEqual(ungroundedQuantities('Because the claim is $325,000, it meets the escalation threshold.', { facts: { claims }, docs: [SOP] }), ['$325,000']);
});
test('a generic word like "claim" in a policy sentence does not license a different amount', () => {
  assert.deepEqual(ungroundedQuantities('The claim amount is $5,000.', { facts: { claims }, docs: [SOP] }), ['$5,000']);
});
