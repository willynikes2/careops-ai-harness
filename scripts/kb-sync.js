// Pure planning for loading seed/kb-docs into the KB instance. The source field carries a content
// fingerprint, so an edited document is detected instead of being skipped because its title exists.
import { createHash } from 'node:crypto';

export const sourceFor = (f) => `careops:${f.file}#${createHash('sha256').update(f.content).digest('hex').slice(0, 12)}`;
export function parseDoc(file, raw) {
  const fm = Object.fromEntries([...raw.match(/^---\n([\s\S]*?)\n---/)[1].matchAll(/^(\w+):\s*"?(.+?)"?$/gm)].map(m => [m[1], m[2]]));
  return { file, title: fm.title, collection: fm.collection, content: raw.replace(/^---[\s\S]*?---\n/, '') };
}
export function planKbSync(existing, files) {
  const byTitle = new Map(existing.map(d => [d.title, d]));
  const plan = { add: [], skip: [], stale: [] };
  for (const f of files) {
    const current = byTitle.get(f.title);
    if (!current) plan.add.push(f);
    else if (current.source === sourceFor(f)) plan.skip.push(f);
    else plan.stale.push(f);
  }
  return plan;
}
