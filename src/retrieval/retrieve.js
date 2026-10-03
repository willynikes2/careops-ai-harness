import { ROLE_COLLECTIONS } from '../policy/permissions.js';

// Authorization is applied to retrieval results BEFORE any content reaches the model.
export async function retrieveForUser({ kb, user, query, maxDocs = 3, maxChars = 3500 }) {
  const allowed = new Set(Object.hasOwn(ROLE_COLLECTIONS, user.role) ? ROLE_COLLECTIONS[user.role] : []);
  const hits = await kb.search(query, { limit: 10 });
  const permitted = hits.filter(h => allowed.has(h.collection));
  const docs = [];
  for (const h of permitted.slice(0, maxDocs)) {
    const d = await kb.get(h.id);
    if (allowed.has(d.collection)) docs.push({ ...d, content: d.content.slice(0, maxChars) });
  }
  return { docs, filteredOut: hits.length - permitted.length };
}
export function buildQuery(intent, message, facts, claimIds = []) {
  // A named claim → search by its payer + denial code; otherwise search by what the user asked.
  if (intent === 'billing' && claimIds.length && facts.claims?.length) { const c = facts.claims[0]; return [c.payer, c.denialCode, 'denial authorization'].filter(Boolean).join(' '); }
  if (intent === 'pto_request' || intent === 'pto_question') return `PTO ${message}`;
  return message;
}
const attr = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
// Retrieved text is data, never instructions: fence it and strip anything that could close the fence.
export const renderDocs = (docs) => docs.map(d =>
  `<untrusted_document id="${attr(d.id)}" title="${attr(d.title)}">\n${String(d.content).replace(/<\/?untrusted_document/gi, '[removed-tag]')}\n</untrusted_document>`).join('\n\n');
