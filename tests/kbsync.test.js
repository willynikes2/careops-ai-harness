import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planKbSync, sourceFor } from '../scripts/kb-sync.js';

const file = (title, content) => ({ file: `${title}.md`, title, collection: 'careops-hr', content });
test('new documents are added, unchanged ones skipped', () => {
  const a = file('A', 'one'); const b = file('B', 'two');
  const plan = planKbSync([{ title: 'A', source: sourceFor(a) }], [a, b]);
  assert.deepEqual(plan.add.map(f => f.title), ['B']);
  assert.deepEqual(plan.skip.map(f => f.title), ['A']);
  assert.deepEqual(plan.stale, []);
});
test('an edited document is reported stale, not silently skipped', () => {
  const old = file('A', 'one'); const edited = file('A', 'one, edited');
  const plan = planKbSync([{ title: 'A', source: sourceFor(old) }], [edited]);
  assert.deepEqual(plan.stale.map(f => f.title), ['A']);
  assert.deepEqual(plan.add, []);
});
test('a document loaded before fingerprints existed is treated as stale', () => {
  const plan = planKbSync([{ title: 'A', source: 'careops:A.md' }], [file('A', 'one')]);
  assert.deepEqual(plan.stale.map(f => f.title), ['A']);
});
