import { newId } from '../util/ids.js';
import { nyDate } from '../util/clock.js';
import { formatDate, resolvePtoDate } from '../util/dates.js';
import { can, INTENT_PERMISSION, ROLE_COLLECTIONS } from '../policy/permissions.js';
import { classifyIntent } from '../policy/intent.js';
import { getBalance } from '../domain/pto.js';
import { getAssignedClaim, listAssignedClaims } from '../domain/claims.js';
import { retrieveForUser, buildQuery } from '../retrieval/retrieve.js';
import { proposeAction } from '../tools/actions.js';
import { startTrace } from './trace.js';
import { buildModelInput } from './context.js';
import { validateTurn } from './validate.js';

const DENIAL_TEXT = {
  billing: "I can't help with claims or patient billing information — your role doesn't have access, so no billing data was retrieved. If you need billing help, contact the billing team.",
  pto_request: "Your role can't submit PTO requests in CareOps.",
  default: "Your role doesn't have access to that.",
};
const UNAVAILABLE = 'The AI service is unavailable right now — your data is unchanged. You can still use the other pages.';
const SKIP = (trace, names, why) => names.forEach(n => trace.add(n, 'skipped', why));

// Minimum necessary, scoped to this user: the only personal data the model will ever see.
export function gatherFacts(db, user, intent, claimIds, dateRes) {
  const facts = {};
  if ((intent === 'pto_question' || intent === 'pto_request') && can(user, 'pto:read:self')) {
    const b = getBalance(db, user.id);
    if (b) facts.ptoBalance = { ...b, hoursRequestable: b.hoursAvailable - b.hoursPending };
  }
  if (intent === 'billing') {
    facts.claims = claimIds.length ? claimIds.map(id => getAssignedClaim(db, user, id)).filter(Boolean) : listAssignedClaims(db, user).filter(c => c.status === 'DENIED');
    facts.missingClaimIds = claimIds.filter(id => !facts.claims.some(c => c.id === id));
  }
  if (dateRes?.kind === 'date') facts.ptoDateCandidates = [dateRes.date];
  return facts;
}
const describeFacts = (f) => [
  f.ptoBalance && `PTO balance ${f.ptoBalance.hoursAvailable} h (${f.ptoBalance.hoursPending} h pending)`,
  f.claims && `${f.claims.length} authorized claim(s)${f.claims.length ? `: ${f.claims.map(c => c.id).join(', ')}` : ''}`,
  f.ptoDateCandidates && `date resolved deterministically to ${f.ptoDateCandidates[0]}`,
].filter(Boolean).join('; ') || 'No personal records needed.';

export function getDefaultModel(db, config) {
  const row = db.prepare("SELECT results_json FROM lab_results WHERE lab = 'models'").get();
  return (row && JSON.parse(row.results_json).defaultModel) || config.defaultModel;
}

export function createHarness({ db, kb, provider, clock, audit, budget, prompts, config }) {
  function finish(trace, turn) {
    trace.add('audit', 'ok', `Recorded as ${turn.turnId}.`, { status: turn.status });
    audit.saveTrace(trace.toJSON());
    audit.event({ actor: trace.user, kind: 'chat_turn', turnId: turn.turnId, detail: { status: turn.status, model: turn.model } });
    return turn;
  }

  async function runTurn({ user, message, model = getDefaultModel(db, config), promptVariant = 'hardened', purpose = 'chat' }) {
    const turnId = newId('turn');
    const trace = startTrace(turnId, user, clock);
    const reply = (f) => finish(trace, { turnId, status: 'answered', answer: '', citations: [], clarification: null, proposedAction: null, model: null, costUsd: 0, latencyMs: 0, ...f });
    trace.add('identity', 'ok', `Signed in as ${user.displayName} (${user.role}). Identity comes from the server session, not the browser.`, { userId: user.id, role: user.role });

    // 1. POLICY — before any data is touched
    const { intent, claimIds } = classifyIntent(message);
    const permission = INTENT_PERMISSION[intent];
    if (!can(user, permission)) {
      trace.add('policy', 'denied', `Classified as "${intent}", which requires "${permission}". The ${user.role} role does not have it, so nothing was retrieved.`, { intent, permission });
      SKIP(trace, ['state', 'retrieval', 'reasoning', 'validation', 'execution'], 'Stopped by policy.');
      audit.event({ actor: user, kind: 'access_denied', security: true, turnId, detail: { intent, permission, message: message.slice(0, 200) } });
      return reply({ status: 'denied', answer: DENIAL_TEXT[intent] ?? DENIAL_TEXT.default });
    }
    trace.add('policy', 'ok', `Allowed: "${intent}" requires "${permission}".`, { intent, permission });

    // 2. STATE — authoritative facts from the database
    const dateRes = intent === 'pto_request' ? resolvePtoDate(message, clock.now()) : null;
    const facts = gatherFacts(db, user, intent, claimIds, dateRes);
    trace.add('state', 'ok', describeFacts(facts), { facts });

    if (facts.missingClaimIds?.length) {
      const ids = facts.missingClaimIds.join(', ');
      SKIP(trace, ['retrieval', 'reasoning'], 'No authorized record — the model was not asked to guess.');
      trace.add('validation', 'ok', `Resource check: no authorized claim with ID ${ids}.`, { missing: facts.missingClaimIds });
      trace.add('execution', 'skipped', 'Nothing to execute.');
      audit.event({ actor: user, kind: 'resource_not_found', turnId, detail: { claimIds: facts.missingClaimIds } });
      return reply({ answer: `No authorized claim with ID ${ids} was found in your queue. I won't guess at a status, patient, payer, or denial reason. Check the claim number, or ask a billing supervisor whether it is assigned to someone else.` });
    }
    if (dateRes && dateRes.kind !== 'date') {
      SKIP(trace, ['retrieval', 'reasoning'], 'The date must be settled before any action is proposed.');
      const clarification = dateRes.kind === 'ambiguous'
        ? { question: `"${dateRes.phrase}" could mean ${formatDate(dateRes.candidates[0])} or ${formatDate(dateRes.candidates[1])}. Which one did you mean?`, options: dateRes.candidates.map(d => ({ label: formatDate(d), message: `Take ${d} off.` })) }
        : { question: 'Which date would you like off? Say a weekday (for example "this Friday") or a date like 2026-10-16.', options: [] };
      trace.add('validation', 'ok', dateRes.kind === 'ambiguous' ? `Ambiguous date (${dateRes.candidates.join(' or ')}) — asking instead of assuming.` : 'No date given — asking.', { dateResolution: dateRes });
      trace.add('execution', 'skipped', 'Nothing changes until the date is confirmed.');
      return reply({ status: 'clarify', answer: clarification.question, clarification });
    }

    // 3. RETRIEVAL — role-scoped before the model sees anything
    let docs = [];
    try {
      const r = await retrieveForUser({ kb, user, query: buildQuery(intent, message, facts, claimIds) });
      docs = r.docs;
      trace.add('retrieval', 'ok', `${docs.length} document(s) from ${ROLE_COLLECTIONS[user.role].join(', ')}; ${r.filteredOut} result(s) outside this role were dropped before the model saw anything.`, { docs: docs.map(d => ({ id: d.id, title: d.title, collection: d.collection })), filteredOut: r.filteredOut });
    } catch (err) {
      trace.add('retrieval', 'error', 'Knowledge service unavailable — continuing with database facts only.', { error: String(err.message) });
    }

    // 4. REASONING
    if (budget.remaining() <= 0) {
      trace.add('reasoning', 'skipped', 'Daily AI budget reached — no model call made.', { dailyBudgetUsd: config.dailyBudgetUsd });
      SKIP(trace, ['validation', 'execution'], 'No state was changed.');
      audit.event({ actor: user, kind: 'budget_exhausted', turnId });
      return reply({ status: 'ai_unavailable', answer: UNAVAILABLE });
    }
    const input = buildModelInput({ systemPrompt: prompts[promptVariant], user, intent, facts, docs, message, today: nyDate(clock.now()) });
    let out;
    try {
      out = await provider.complete({ model, ...input });
      budget.record({ model, purpose, usage: out.usage, latencyMs: out.latencyMs, ok: true });
      trace.add('reasoning', 'ok', `${model} answered in ${out.latencyMs} ms for $${out.usage.costUsd.toFixed(5)}.`, { model, promptVariant, usage: out.usage, latencyMs: out.latencyMs });
    } catch (err) {
      budget.record({ model, purpose, usage: null, latencyMs: 0, ok: false });
      trace.add('reasoning', 'error', 'The AI provider failed or timed out.', { model, error: String(err.message) });
      SKIP(trace, ['validation', 'execution'], 'No state was changed.');
      audit.event({ actor: user, kind: 'provider_failure', turnId, detail: { model, error: String(err.message) } });
      return reply({ status: 'ai_unavailable', answer: UNAVAILABLE, model });
    }

    // 5. VALIDATION — the model's output is a proposal, never authority
    const meta = { model, costUsd: out.usage.costUsd, latencyMs: out.latencyMs, _raw: out.text };
    const v = validateTurn({ text: out.text, docs, facts, user, intent });
    if (!v.ok) {
      trace.add('validation', 'error', `Withheld: ${v.reason}.`, { reason: v.reason, raw: out.text.slice(0, 2000) });
      trace.add('execution', 'skipped', 'Nothing executed.');
      audit.event({ actor: user, kind: 'output_rejected', security: true, turnId, detail: { reason: v.reason, model } });
      return reply({ status: 'invalid_output', answer: "The AI's answer failed a safety check and was withheld.", reason: v.reason, ...meta });
    }
    if (v.actionRejection) audit.event({ actor: user, kind: 'tool_rejected', security: true, turnId, detail: { proposal: v.data.proposed_action, reason: v.actionRejection } });
    trace.add('validation', v.actionRejection ? 'denied' : 'ok', v.summary, { actionRejection: v.actionRejection });

    // 6. EXECUTION — deterministic, only after the user confirms
    const proposedAction = v.action ? proposeAction(db, { user, turnId, action: v.action, clock }) : null;
    trace.add('execution', proposedAction ? 'ok' : 'skipped', proposedAction ? `Proposed "${proposedAction.summary}". Waiting for the user to confirm — the model cannot execute it.` : 'No action proposed.', { proposedAction });
    const clarification = v.data.needs_clarification ? { question: v.data.needs_clarification, options: [] } : null;
    return reply({ status: clarification ? 'clarify' : 'answered', answer: v.data.answer, citations: v.citations, proposedAction, clarification, ...meta });
  }
  return { runTurn };
}
