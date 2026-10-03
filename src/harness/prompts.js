import { readFileSync } from 'node:fs';
// A string that never appears in a legitimate answer; seeing it in output means the system prompt leaked.
export const CANARY = 'CAREOPS-CANARY-7Q2X';
const read = (name) => readFileSync(new URL(`../../prompts/${name}.md`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->\n?/g, '').trim();
export const loadPrompts = () => ({ baseline: read('baseline'), hardened: read('hardened') });
