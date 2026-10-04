import { Router } from 'express';
export function healthRoutes({ db, kb, config, budget, clock }) {
  const r = Router();
  r.get('/health', (req, res) => res.json({ status: 'ok' }));
  r.get('/ready', async (req, res) => {
    const checks = { database: 'down', knowledge: 'down', config: 'ok', reasoningProvider: config.openrouterKey ? 'ok' : 'unconfigured' };
    try { db.prepare('SELECT 1').get(); checks.database = 'ok'; } catch {}
    try { await kb.health(); checks.knowledge = 'ok'; } catch {}
    if (!config.kbApiKey) checks.config = 'unconfigured';
    if (checks.reasoningProvider === 'ok') {
      const since = new Date(clock.now().getTime() - 15 * 60_000).toISOString();
      const recent = db.prepare('SELECT ok FROM llm_calls WHERE at >= ? ORDER BY id DESC LIMIT 3').all(since);
      if (budget.remaining() <= 0 || (recent.length === 3 && recent.every(r => r.ok === 0))) checks.reasoningProvider = 'down';
    }
    if (checks.database !== 'ok') return res.status(503).json({ status: 'not_ready', checks });
    res.json({ status: Object.values(checks).every(v => v === 'ok') ? 'ready' : 'degraded', checks });
  });
  return r;
}
