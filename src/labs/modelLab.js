import { MODELS } from '../llm/models.js';
import { parseModelOutput } from '../llm/contract.js';
import { fixedClock } from '../util/clock.js';
import { createHarness } from '../harness/pipeline.js';
import { openDb } from '../db/index.js';
import { seedDb } from '../db/seed.js';
import { createAudit } from '../audit/audit.js';
import { EVAL_ITEMS, EVAL_NOW } from './evalSet.js';

// Five binary criteria per answer; an item passes only if all five pass.
export function scoreTurn(item, turn) {
  const answered = turn.status === 'answered' || turn.status === 'clarify';
  const criteria = {
    json_valid: answered && parseModelOutput(turn._raw ?? '').ok,
    citations_valid: answered && (!item.expect.mustCite || turn.citations.length > 0),
    no_fabricated_ids: !(turn.status === 'invalid_output' && /records not in the authorized context/.test(turn.reason ?? '')),
    expected_action: (turn.proposedAction?.tool ?? null) === item.expect.tool,
    key_fact: answered && item.expect.keyFacts.every(group => group.some(k => turn.answer.toLowerCase().includes(k.toLowerCase()))),
  };
  const failed = Object.entries(criteria).filter(([, ok]) => !ok).map(([k]) => k);
  // A provider outage (402/429/timeout) says nothing about the model's answer quality: reported, not scored.
  return { pass: failed.length === 0, failed, criteria, infraError: turn.status === 'ai_unavailable' };
}
export function summarizeModel(m, rows) {
  const mine = rows.filter(r => r.model === m.id); const scored = mine.filter(r => !r.infraError); const n = scored.length;
  const criteria = Object.fromEntries(['json_valid', 'citations_valid', 'no_fabricated_ids', 'expected_action', 'key_fact'].map(k => [k, scored.filter(r => r.criteria[k]).length]));
  const passed = scored.filter(r => r.pass).length;
  const avgCostUsd = n ? scored.reduce((a, r) => a + r.costUsd, 0) / n : 0;
  return { id: m.id, label: m.label, passed, total: n, errors: mine.length - n, passRate: n ? passed / n : 0, criteria,
    avgCostUsd, costPer1k: avgCostUsd * 1000, avgLatencyMs: n ? Math.round(scored.reduce((a, r) => a + r.latencyMs, 0) / n) : 0 };
}
export function chooseDefault(models) {
  const ok = models.filter(m => m.passRate >= 0.9).sort((a, b) => a.avgCostUsd - b.avgCostUsd);
  return (ok[0] ?? [...models].sort((a, b) => b.passRate - a.passRate)[0]).id;
}
const userById = (db, id) => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); return { id: u.id, username: u.username, displayName: u.display_name, role: u.role, managerId: u.manager_id }; };

export async function runModelLab({ db, kb, provider, audit, budget, prompts, config, reps = 3 }) {
  // Evals run on a private, freshly seeded in-memory copy of the demo world with a fixed clock, so results are
  // reproducible and independent of whatever the live demo has done. Only spend (budget) and the final result touch the live DB.
  const clock = fixedClock(EVAL_NOW);
  const evalDb = openDb(':memory:');
  seedDb(evalDb, { clock, demoPassword: 'eval-only' });
  const harness = createHarness({ db: evalDb, kb, provider, clock, audit: createAudit(evalDb, clock), budget, prompts, config });
  const rows = [];
  for (const m of MODELS) for (let rep = 1; rep <= reps; rep += 1) for (const item of EVAL_ITEMS) {
    const turn = await harness.runTurn({ user: userById(evalDb, item.user), message: item.message, model: m.id, purpose: 'lab' });
    const s = scoreTurn(item, turn);
    rows.push({ itemId: item.id, question: item.message, model: m.id, rep, pass: s.pass, failed: s.failed, criteria: s.criteria, infraError: s.infraError, costUsd: turn.costUsd, latencyMs: turn.latencyMs });
  }
  const models = MODELS.map(m => summarizeModel(m, rows));
  const out = { at: new Date().toISOString(), items: EVAL_ITEMS.length, reps, defaultModel: chooseDefault(models), models, rows: rows.map(({ criteria, ...r }) => r) };
  db.prepare("INSERT OR REPLACE INTO lab_results (lab, at, results_json) VALUES ('models', ?, ?)").run(out.at, JSON.stringify(out));
  return out;
}
