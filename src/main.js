import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { seedDb } from './db/seed.js';
import { createApp } from './app.js';
import { createKbClient } from './retrieval/kbClient.js';
import { OpenRouterProvider } from './llm/openrouter.js';
import { systemClock } from './util/clock.js';

const config = loadConfig();
const db = openDb(config.dbPath);
if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) seedDb(db, { clock: systemClock, demoPassword: config.demoPassword });
const kb = createKbClient({ baseUrl: config.kbUrl, apiKey: config.kbApiKey });
const provider = new OpenRouterProvider({ apiKey: config.openrouterKey });
const { app } = createApp({ db, kb, provider, clock: systemClock, config });
app.listen(config.port, () => console.log(JSON.stringify({ msg: 'careops listening', port: config.port })));
