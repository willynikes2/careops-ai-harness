// Idempotently loads seed/kb-docs/*.md into the CareOps KB instance (matched by title).
import { readdirSync, readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';

const { kbUrl, kbApiKey } = loadConfig();
const dir = new URL('../seed/kb-docs/', import.meta.url);
const headers = { 'X-API-Key': kbApiKey, 'Content-Type': 'application/json' };
const list = await fetch(`${kbUrl}/api/v1/documents?limit=200`, { headers });
if (!list.ok) throw new Error(`KB list failed: ${list.status} ${await list.text()}`);
const existing = new Set((await list.json()).documents.map(d => d.title));
for (const f of readdirSync(dir).filter(n => n.endsWith('.md')).sort()) {
  const raw = readFileSync(new URL(f, dir), 'utf8');
  const fm = Object.fromEntries([...raw.match(/^---\n([\s\S]*?)\n---/)[1].matchAll(/^(\w+):\s*"?(.+?)"?$/gm)].map(m => [m[1], m[2]]));
  const content = raw.replace(/^---[\s\S]*?---\n/, '');
  if (existing.has(fm.title)) { console.log(`skip  ${fm.title}`); continue; }
  const res = await fetch(`${kbUrl}/api/v1/ingest`, { method: 'POST', headers, body: JSON.stringify({ title: fm.title, content, doc_type: fm.collection, tags: `careops,${fm.collection}`, source: `careops:${f}` }) });
  if (!res.ok) throw new Error(`ingest ${f} failed: ${res.status} ${await res.text()}`);
  console.log(`added ${fm.title}`);
}
