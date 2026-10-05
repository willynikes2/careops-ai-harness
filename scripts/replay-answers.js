// Re-checks stored real model answers against the CURRENT validator, without calling any model ($0).
// For each Model Lab row it rebuilds the exact facts and documents the harness gave the model (fresh seeded
// eval world, fixed eval clock, same role-scoped retrieval), then validates the stored answer text.
// Use it to see whether a validator change would withhold correct answers before spending on a live run.
//
//   node --env-file=.env scripts/replay-answers.js docs/results/model-lab-2026-10-05.json [more.json …]
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { seedDb } from '../src/db/seed.js';
import { fixedClock, nyDate } from '../src/util/clock.js';
import { createKbClient } from '../src/retrieval/kbClient.js';
import { classifyIntent } from '../src/policy/intent.js';
import { resolvePtoDate } from '../src/util/dates.js';
import { gatherFacts } from '../src/harness/pipeline.js';
import { retrieveForUser, buildQuery } from '../src/retrieval/retrieve.js';
import { validateTurn } from '../src/harness/validate.js';
import { EVAL_ITEMS, EVAL_NOW } from '../src/labs/evalSet.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: replay-answers.js <model-lab results.json> [...]'); process.exit(2); }
const config = loadConfig();
const kb = createKbClient({ baseUrl: config.kbUrl, apiKey: config.kbApiKey });
const clock = fixedClock(EVAL_NOW);
const db = openDb(':memory:'); seedDb(db, { clock, demoPassword: 'replay-only' });
const userById = (id) => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); return { id: u.id, username: u.username, displayName: u.display_name, role: u.role, managerId: u.manager_id }; };

const contexts = new Map();
async function contextFor(item) {
  if (contexts.has(item.id)) return contexts.get(item.id);
  const user = userById(item.user);
  const { intent, claimIds } = classifyIntent(item.message);
  const dateRes = intent === 'pto_request' ? resolvePtoDate(item.message, clock.now()) : null;
  const facts = gatherFacts(db, user, intent, claimIds, dateRes, item.message);
  const { docs } = await retrieveForUser({ kb, user, query: buildQuery(intent, item.message, facts, claimIds) });
  const ctx = { user, intent, facts, docs };
  contexts.set(item.id, ctx);
  return ctx;
}

let checked = 0; const changed = [];
for (const file of files) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  for (const row of run.rows ?? []) {
    if (!row.answer || row.status !== 'answered' && row.status !== 'clarify') continue; // only answers a user saw
    const item = EVAL_ITEMS.find(i => i.id === row.itemId);
    if (!item) continue;
    const ctx = await contextFor(item);
    const text = JSON.stringify({ answer: row.answer, citations: row.sources ?? [] });
    const v = validateTurn({ text, docs: ctx.docs, facts: ctx.facts, user: ctx.user, intent: ctx.intent, message: item.message, today: nyDate(clock.now()) });
    checked += 1;
    if (!v.ok) changed.push({ file, model: row.model, itemId: row.itemId, rep: row.rep, reason: v.reason, answer: row.answer });
  }
}
console.log(`replayed ${checked} stored answers that users saw; ${changed.length} would now be withheld`);
for (const c of changed) console.log(`\n[${c.model} · ${c.itemId} · run ${c.rep}] ${c.reason}\n  ${c.answer.replace(/\s+/g, ' ').slice(0, 400)}`);
