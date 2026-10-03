import { once } from 'node:events';
import { openDb } from '../src/db/index.js';
import { seedDb } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { fixedClock } from '../src/util/clock.js';
import { FakeProvider } from '../src/llm/fake.js';
import { fakeKb } from './fixtures/kb.js';

export const DEMO_NOW = '2026-10-06T14:00:00Z';
const silent = { error() {}, info() {}, log() {} };

export async function startTestApp(overrides = {}) {
  const db = openDb(':memory:');
  const clock = overrides.clock ?? fixedClock(DEMO_NOW);
  seedDb(db, { clock, demoPassword: 'pw' });
  const kb = overrides.kb ?? fakeKb();
  const provider = overrides.provider ?? new FakeProvider([]);
  const config = { ...loadConfig({}), demoPassword: 'pw', openrouterKey: 'test', kbApiKey: 'test', ...overrides.config };
  const { app } = createApp({ db, kb, provider, clock, config, logger: silent });
  const server = app.listen(0); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, kb, provider, base, close: () => new Promise(r => server.close(r)), login: (u) => login(base, u, 'pw') };
}

export async function login(base, username, password) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (res.status !== 200) throw new Error(`login failed ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const { user, csrfToken } = await res.json();
  const call = async (path, { method = 'GET', body, csrf = true } = {}) => {
    const headers = { cookie, 'content-type': 'application/json' };
    if (csrf) headers['x-csrf-token'] = csrfToken;
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { user, call };
}
