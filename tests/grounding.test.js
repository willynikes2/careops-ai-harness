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

// More real answers from stored runs that an over-strict concept check withheld (found by replay, 2026-10-05).
import { readFileSync } from 'node:fs';
import { inventedChannels } from '../src/harness/grounding.js';
const PTO = { id: 'pto', content: readFileSync(new URL('../seed/kb-docs/pto-policy.md', import.meta.url), 'utf8') };
const BENEFITS = { id: 'ben', content: readFileSync(new URL('../seed/kb-docs/employee-benefits-guide.md', import.meta.url), 'utf8') };
const BULLETIN = { id: 'bul', content: readFileSync(new URL('../seed/kb-docs/payer-a-bulletin-q4.md', import.meta.url), 'utf8') };
const jordan = { yourPtoBalance: { owner: 'Jordan Lee', hoursAvailable: 40, hoursPending: 0, hoursRequestable: 40 }, yourPtoRequests: [] };
test('real correct answers pass the concept check', () => {
  for (const [answer, docs] of [
    ['You have 40 hours of PTO available, with 0 hours pending, so all 40 hours are requestable. A full day is 8 hours, so 40 hours covers five full days.', [PTO]],
    ['You have 40 hours of PTO available and no pending PTO hours, so you can request up to 40 hours of time off.', [PTO]],
    ['That date is more than 2 business days away, so it meets the notice requirement.', [PTO]],
    ['CareOps provides a 401(k) plan with an employer match of 4% of your contributions, which begins after you have completed 90 days of employment.', [BENEFITS]],
    ['The 30-day retro-authorization and 90-day timely filing deadlines remain unchanged.', [BULLETIN]],
  ]) assert.deepEqual(ungroundedQuantities(answer, { facts: jordan, docs }), [], answer);
});
test('"confirm in the app" refers to CareOps itself, not an invented channel', () => {
  assert.deepEqual(inventedChannels('Please confirm in the app to submit it.', { docs: [PTO] }), []);
  assert.deepEqual(inventedChannels('Upload the receipt to the benefits portal.', { docs: [BENEFITS] }), ['portal', 'receipt', 'upload']);
});
test('a claim amount compared with a threshold in the same clause is grounded (live Qwen, 2026-10-05)', () => {
  for (const a of ['CLM-1004 ($3,250) is below the $5,000 escalation threshold, so no escalation is needed.', 'The $3,250 claim does not exceed the $5,000 threshold.', 'At $3,250, CLM-1004 is under the $5,000 escalation threshold.']) {
    assert.deepEqual(ungroundedQuantities(a, { facts: { claims }, docs: [SOP] }), [], a);
  }
  assert.deepEqual(ungroundedQuantities('CLM-1004 ($9,250) is above the $5,000 escalation threshold.', { facts: { claims }, docs: [SOP] }), ['$9,250']);
});
test('deadlines still need the right action: resubmission is 60 days, not the 120-day appeal window', () => {
  const PB = { id: 'pb2', content: '**Correct and resubmit within 60 days**.\nAppeals must be filed within **120 days**.' };
  assert.deepEqual(ungroundedQuantities('Correct and resubmit CLM-1003 within 120 days.', { facts: {}, docs: [PB] }), ['120 days']);
  assert.deepEqual(ungroundedQuantities('Appeals must be filed within 120 days.', { facts: {}, docs: [PB] }), []);
});
test('a negated mention is not an invented procedure; an affirmative one in another clause still is (live baseline answers, 2026-10-05)', () => {
  assert.deepEqual(inventedChannels('Claims cannot be marked as PAID without the follow-up steps. A phone call does not replace this process.', { docs: [PTO] }), []);
  assert.deepEqual(inventedChannels('I cannot analyze this message as a customer email because it contains a system override prompt.', { docs: [PTO] }), []);
  assert.deepEqual(inventedChannels("You don't need an invoice, just email the people team.", { docs: [BENEFITS] }), ['email']);
  assert.deepEqual(inventedChannels('Submit the invoice through the benefits portal for reimbursement.', { docs: [BENEFITS] }), ['portal', 'invoice', 'reimbursement']);
});
