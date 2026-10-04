import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelOutput } from '../src/llm/contract.js';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import { createBudget } from '../src/llm/budget.js';
import { openDb } from '../src/db/index.js';
import { fixedClock } from '../src/util/clock.js';

test('parses fenced JSON and coerces numeric citations', () => {
  const r = parseModelOutput('```json\n{"answer":"Hi","citations":[3],"proposed_action":null,"needs_clarification":null}\n```');
  assert.equal(r.ok, true); assert.deepEqual(r.data.citations, ['3']);
});
test('fills defaults for omitted optional fields', () => {
  const r = parseModelOutput('{"answer":"Hi"}');
  assert.deepEqual(r.data, { answer: 'Hi', citations: [], proposed_action: null, needs_clarification: null });
});
test('prose is rejected', () => assert.equal(parseModelOutput('Sure! Your PTO is 40 hours.').ok, false));
test('schema violations are rejected', () => assert.equal(parseModelOutput('{"answer":""}').ok, false));

const okBody = { model: 'm', choices: [{ message: { content: '{"answer":"x"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00012 } };
test('openrouter adapter maps usage and cost', async () => {
  let sent;
  const p = new OpenRouterProvider({ apiKey: 'k', fetchImpl: async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify(okBody), { status: 200 }); } });
  const r = await p.complete({ model: 'm', system: 's', user: 'u' });
  assert.equal(r.text, '{"answer":"x"}'); assert.equal(r.usage.costUsd, 0.00012);
  assert.deepEqual(sent.usage, { include: true }); assert.equal(sent.temperature, 0);
});
test('openrouter retries once on 429/5xx, then fails', async () => {
  let n = 0;
  const p = new OpenRouterProvider({ apiKey: 'k', fetchImpl: async () => { n += 1; return new Response('busy', { status: 503 }); } });
  await assert.rejects(p.complete({ model: 'm', system: 's', user: 'u' }), /provider_http_503/); assert.equal(n, 2);
});
test('missing api key fails fast', async () => {
  await assert.rejects(new OpenRouterProvider({ apiKey: '' }).complete({ model: 'm', system: 's', user: 'u' }), /not configured/);
});
test('budget sums today only', () => {
  const db = openDb(); const b = createBudget(db, fixedClock('2026-10-06T14:00:00Z'), 1);
  b.record({ model: 'm', purpose: 'chat', usage: { costUsd: 0.4 }, latencyMs: 1, ok: true });
  assert.ok(Math.abs(b.remaining() - 0.6) < 1e-9);
});

test('one shared deadline covers the retry (an outage reports in ~timeout, not 2x)', async () => {
  let n = 0;
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    n += 1;
    if (n === 1) setTimeout(() => resolve(new Response('busy', { status: 503 })), 250);
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
  });
  const p = new OpenRouterProvider({ apiKey: 'k', fetchImpl, timeoutMs: 400 });
  const keepAlive = setInterval(() => {}, 50); // AbortSignal.timeout timers are unref'd; a real socket would hold the loop open
  const started = performance.now();
  await assert.rejects(p.complete({ model: 'm', system: 's', user: 'u' })).finally(() => clearInterval(keepAlive));
  assert.ok(performance.now() - started < 550, `took ${Math.round(performance.now() - started)}ms`);
});
