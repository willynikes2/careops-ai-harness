// Deterministic, explainable routing. It is NOT the security boundary: state and retrieval are role-scoped regardless.
// "claim", "reimburse" and "owe" alone are ordinary employee-benefit words, so they only count as billing with billing context.
const BILLING_STRONG = /\b(patients?|payers?|billing|remittance|denials?|clm-\d{4}|co-\d+)\b/i;
const CLAIM = /\bclaims?\b/i;
const CLAIM_CONTEXT = /\b(denied|queue|assigned|payers?|patients?|billing|resubmit\w*|appeal\w*)\b/i;
const PTO = /\b(pto|time off|day off|days off|vacation|leave)\b|\btake\b.*\boff\b/i;
// "request" only as a verb with something bookable after it ("my PTO request" is a noun, not an action)
const PTO_ACTION = /\b(take|book|schedule|put in)\b|\brequest\s+(pto|time off|a day|the day|leave|vacation|\d{4}-\d{2}-\d{2}|(this |next )?(mon|tues|wednes|thurs|fri)day)/i;
export function classifyIntent(text) {
  const claimIds = [...new Set([...String(text).matchAll(/\bCLM-\d{4}\b/gi)].map(m => m[0].toUpperCase()))];
  if (claimIds.length || BILLING_STRONG.test(text) || (CLAIM.test(text) && CLAIM_CONTEXT.test(text))) return { intent: 'billing', claimIds };
  if (PTO.test(text)) return { intent: PTO_ACTION.test(text) ? 'pto_request' : 'pto_question', claimIds: [] };
  return { intent: 'general', claimIds: [] };
}
