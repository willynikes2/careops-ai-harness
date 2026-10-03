// Deterministic, explainable routing. It is NOT the security boundary: state and retrieval are role-scoped regardless.
const BILLING = /\b(claims?|denials?|denied|patients?|payers?|billing|owes?|owed|reimburse\w*|remittance|clm-\d{4})\b/i;
const PTO = /\b(pto|time off|day off|days off|vacation|leave)\b|\btake\b.*\boff\b/i;
const PTO_ACTION = /\b(take|request|book|schedule|put in)\b/i;
export function classifyIntent(text) {
  const claimIds = [...new Set([...String(text).matchAll(/\bCLM-\d{4}\b/gi)].map(m => m[0].toUpperCase()))];
  if (claimIds.length || BILLING.test(text)) return { intent: 'billing', claimIds };
  if (PTO.test(text)) return { intent: PTO_ACTION.test(text) ? 'pto_request' : 'pto_question', claimIds: [] };
  return { intent: 'general', claimIds: [] };
}
