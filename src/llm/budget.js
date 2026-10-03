import { nyDate } from '../util/clock.js';
// Public URL → hard daily spend ceiling, measured from provider-reported cost.
export function createBudget(db, clock, dailyUsd) {
  return {
    remaining() { const { spent } = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) spent FROM llm_calls WHERE day = ?').get(nyDate(clock.now())); return dailyUsd - spent; },
    record({ model, purpose, usage, latencyMs, ok }) {
      db.prepare('INSERT INTO llm_calls (at, day, model, purpose, cost_usd, tokens_in, tokens_out, latency_ms, ok) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(clock.now().toISOString(), nyDate(clock.now()), model, purpose, usage?.costUsd ?? 0, usage?.tokensIn ?? 0, usage?.tokensOut ?? 0, latencyMs ?? 0, ok ? 1 : 0);
    },
  };
}
