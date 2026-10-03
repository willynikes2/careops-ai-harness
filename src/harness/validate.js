import { parseModelOutput } from '../llm/contract.js';
import { validateProposal } from '../tools/registry.js';
import { CANARY } from './prompts.js';

// The model's output is a proposal. Every claim it makes that the app can check, the app checks.
export function validateTurn({ text, docs, facts, user, intent }) {
  const parsed = parseModelOutput(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const data = parsed.data;
  if (String(text).includes(CANARY)) return { ok: false, reason: 'output contained protected system-prompt text' };
  const docIds = new Set(docs.map(d => d.id));
  const badCites = data.citations.filter(c => !docIds.has(c));
  if (badCites.length) return { ok: false, reason: `cited documents that were not provided (${badCites.join(', ')})` };
  const known = new Set((facts.claims ?? []).map(c => c.id));
  const mentioned = [...new Set((data.answer.match(/\bCLM-\d{4}\b/gi) ?? []).map(s => s.toUpperCase()))];
  const fabricated = mentioned.filter(id => !known.has(id));
  if (fabricated.length) return { ok: false, reason: `referenced records not in the authorized context (${fabricated.join(', ')})` };
  const p = validateProposal({ proposal: data.proposed_action, user, intent, facts });
  const citations = [...new Set(data.citations)].map(id => ({ docId: id, title: docs.find(d => d.id === id).title }));
  const summary = ['JSON contract ✓', `${citations.length} citation(s) verified`, 'record IDs ✓',
    data.proposed_action ? (p.ok ? `tool "${data.proposed_action.tool}" allowed` : `tool request REJECTED: ${p.reason}`) : 'no tool requested'].join(' · ');
  return { ok: true, data, citations, action: p.ok ? p.action : null, actionRejection: p.ok ? null : p.reason, summary };
}
