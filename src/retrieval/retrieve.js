import { ROLE_COLLECTIONS } from '../policy/permissions.js';

// Authorization is applied to retrieval results BEFORE any content reaches the model.
export async function retrieveForUser({ kb, user, query, maxDocs = 3, maxChars = 3500 }) {
  const collections = Object.hasOwn(ROLE_COLLECTIONS, user.role) ? ROLE_COLLECTIONS[user.role] : [];
  const allowed = new Set(collections);
  // Only the role's collections are queried, so out-of-role documents are never even ranked.
  const hits = (await Promise.all(collections.map(collection => kb.search(query, { limit: 10, collection })))).flat()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const permitted = hits.filter(h => allowed.has(h.collection));
  const fetched = await Promise.all(permitted.slice(0, maxDocs).map(h => kb.get(h.id)));
  const docs = fetched.filter(d => allowed.has(d.collection)).map(d => ({ ...d, content: d.content.slice(0, maxChars) }));
  return { docs, filteredOut: hits.length - permitted.length };
}
// Deterministic tripwire for instruction-like text inside retrieved documents. It never blocks the answer;
// the content is already fenced as untrusted data. It makes the injection attempt visible and auditable.
export const INSTRUCTION_LIKE = /ignore (all )?(previous|prior) instructions|system (notice|override)|administrator mode|you are now (in )?(dan|admin|developer)|grant_admin_role|reveal (the )?(administrator|admin) credentials|salary information|ignore role restrictions|call all (available )?tools|export the database/i;
export const flagInstructionLike = (docs) => docs.filter(d => INSTRUCTION_LIKE.test(d.content)).map(d => ({ id: d.id, title: d.title }));
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
