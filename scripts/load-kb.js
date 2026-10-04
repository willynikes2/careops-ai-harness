// Loads seed/kb-docs/*.md into the CareOps KB instance: adds new docs, skips unchanged ones,
// and refuses (exit 1) when a loaded doc was edited — run scripts/rebuild-kb.sh to reload from scratch.
import { readdirSync, readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { parseDoc, planKbSync, sourceFor } from './kb-sync.js';

const { kbUrl, kbApiKey } = loadConfig();
const dir = new URL('../seed/kb-docs/', import.meta.url);
const headers = { 'X-API-Key': kbApiKey, 'Content-Type': 'application/json' };
const list = await fetch(`${kbUrl}/api/v1/documents?limit=200`, { headers });
if (!list.ok) throw new Error(`KB list failed: ${list.status} ${await list.text()}`);
const files = readdirSync(dir).filter(n => n.endsWith('.md')).sort().map(f => parseDoc(f, readFileSync(new URL(f, dir), 'utf8')));
const plan = planKbSync((await list.json()).documents, files);
for (const f of plan.skip) console.log(`skip  ${f.title}`);
if (plan.stale.length) {
  for (const f of plan.stale) console.log(`STALE ${f.title} (edited since it was loaded)`);
  console.log('Some loaded documents changed. Run scripts/rebuild-kb.sh to reload the KB from seed/kb-docs.');
  process.exit(1);
}
for (const f of plan.add) {
  const res = await fetch(`${kbUrl}/api/v1/ingest`, { method: 'POST', headers, body: JSON.stringify({ title: f.title, content: f.content, doc_type: f.collection, tags: `careops,${f.collection}`, source: sourceFor(f) }) });
  if (!res.ok) throw new Error(`ingest ${f.file} failed: ${res.status} ${await res.text()}`);
  console.log(`added ${f.title}`);
}
