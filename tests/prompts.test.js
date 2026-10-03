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
