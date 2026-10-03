import { Router } from 'express';
export function healthRoutes({ db, kb, config }) {
  const r = Router();
  r.get('/health', (req, res) => res.json({ status: 'ok' }));
  r.get('/ready', async (req, res) => {
    const checks = { database: 'down', knowledge: 'down', config: 'ok', reasoningProvider: config.openrouterKey ? 'ok' : 'unconfigured' };
    try { db.prepare('SELECT 1').get(); checks.database = 'ok'; } catch {}
    try { await kb.health(); checks.knowledge = 'ok'; } catch {}
    if (!config.kbApiKey) checks.config = 'unconfigured';
    if (checks.database !== 'ok') return res.status(503).json({ status: 'not_ready', checks });
    res.json({ status: Object.values(checks).every(v => v === 'ok') ? 'ready' : 'degraded', checks });
  });
  return r;
}
