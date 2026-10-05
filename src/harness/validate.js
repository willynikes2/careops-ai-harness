import { parseModelOutput } from '../llm/contract.js';
import { validateProposal } from '../tools/registry.js';
import { CANARY } from './prompts.js';
import { INTERNAL_FORMAT } from './leaks.js';
import { unknownClaimIds, ungroundedQuantities, claimComparisonProblems, ungroundedDates } from './grounding.js';

// The model's output is a proposal. The app checks what it can check deterministically: the contract, that cited
// sources were supplied, record IDs, numbers, protected text and tool requests. It does not verify prose entailment.
export function validateTurn({ text, docs, facts, user, intent, message = '', today = null }) {
  const parsed = parseModelOutput(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const data = parsed.data;
  if (String(text).includes(CANARY)) return { ok: false, reason: 'output contained protected system-prompt text' };
  if (INTERNAL_FORMAT.test(`${data.answer} ${data.needs_clarification ?? ''}`)) return { ok: false, reason: 'output recited internal instructions' };
  // Models sometimes cite "PTO Policy §3" instead of the id; that names a provided document, so resolve it.
  // A citation that matches no provided document still fails closed.
  const resolve = (c) => docs.find(d => d.id === c) ?? docs.find(d => c.toLowerCase().replace(/^["'“]+/, '').startsWith(d.title.toLowerCase()));
  const badCites = data.citations.filter(c => !resolve(c));
  if (badCites.length) return { ok: false, reason: `cited documents that were not provided (${badCites.join(', ')})` };
  data.citations = [...new Set(data.citations.map(c => resolve(c).id))];
  const known = new Set((facts.claims ?? []).map(c => c.id));
  const shown = `${data.answer} ${data.needs_clarification ?? ''}`; // everything the user will read
  const fabricated = unknownClaimIds(shown, known);
  if (fabricated.length) return { ok: false, reason: `referenced records not in the authorized context (${fabricated.join(', ')})` };
  const ungrounded = ungroundedQuantities(shown, { facts, docs });
  if (ungrounded.length) return { ok: false, reason: `stated numbers not supported by the records or documents (${ungrounded.join(', ')})` };
  const comparisons = claimComparisonProblems(shown, facts);
  if (comparisons.length) return { ok: false, reason: `stated a claim threshold the record contradicts (${comparisons.join('; ')})` };
  const dates = ungroundedDates(shown, { facts, docs, today });
  if (dates.length) return { ok: false, reason: `stated dates not found in the records or documents (${dates.join(', ')})` };
  const p = validateProposal({ proposal: data.proposed_action, user, intent, facts, message });
  const citations = [...new Set(data.citations)].map(id => ({ docId: id, title: docs.find(d => d.id === id).title }));
  const summary = ['JSON contract ✓', `${citations.length} source ID(s) recognized · numbers and dates match a record or document value (same unit) ✓`, 'record IDs ✓',
    data.proposed_action ? (p.ok ? `tool "${data.proposed_action.tool}" allowed` : `tool request REJECTED: ${p.reason}`) : 'no tool requested'].join(' · ');
  return { ok: true, data, citations, action: p.ok ? p.action : null, actionRejection: p.ok ? null : p.reason, notOffered: p.notOffered ?? null, summary };
}
