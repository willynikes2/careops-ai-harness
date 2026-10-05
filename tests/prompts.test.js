import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPrompts, CANARY } from '../src/harness/prompts.js';
test('both prompts load, carry the canary, and differ', () => {
  const p = loadPrompts();
  assert.ok(p.baseline.includes(CANARY) && p.hardened.includes(CANARY));
  assert.ok(p.hardened.length > p.baseline.length * 2);
  assert.match(p.hardened, /untrusted/i);
});
test('the provenance comment is stripped before the prompt reaches a model', () => {
  assert.ok(!loadPrompts().hardened.includes('<!--'));
});
test('the hardened prompt forbids general-knowledge procedures the documents do not contain', () => {
  const { hardened } = loadPrompts();
  assert.match(hardened, /Do not fill gaps with general knowledge/);
  assert.match(hardened, /how insurance claims are usually filed/);
});
test('the hardened prompt shows the expected answer shape when a document says a topic is not covered', () => {
  assert.match(loadPrompts().hardened, /Example — the documents say a topic is not covered/);
});
