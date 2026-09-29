import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { secureRandomId, secureRandomInt, secureRandomItem } from '../shared/secure-random.js';
import { normalizeTeacherPointTypes } from '../shared/teacher-point-types.js';
import { pickRandomMushafEntry } from '../src/lib/randomMushafExcerpt.js';

test('Mushaf secure draws visit every page before restarting without repeating the last page', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('Insecure randomness must not be used'); });
  let state = { index: -1, visitedIndexes: [] };
  const seen = new Set();
  for (let index = 0; index < 20; index += 1) {
    state = pickRandomMushafEntry(20, state.visitedIndexes, state.index);
    assert.ok(state.index >= 0 && state.index < 20);
    assert.ok(!seen.has(state.index));
    seen.add(state.index);
  }
  assert.notEqual(pickRandomMushafEntry(20, state.visitedIndexes, state.index).index, state.index);
  assert.equal(pickRandomMushafEntry(1, [0], 0).index, 0);
  assert.deepEqual(pickRandomMushafEntry(0), { index: -1, visitedIndexes: [] });
  assert.ok(pickRandomMushafEntry(2, [], -1, () => undefined).index >= 0);
});

test('remaining reported random sources and audit process lookup are hardened', async () => {
  for (const path of [
    '../src/components/portal/MushafRecitationDialog.jsx',
    '../src/lib/randomMushafExcerpt.js',
  ]) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /Math\.random/);
  }
  const audit = await readFile(new URL('../scripts/isolated-launch-audit.mjs', import.meta.url), 'utf8');
  assert.ok(audit.includes('spawn(String.raw`C:\\Windows\\System32\\taskkill.exe`'));
  assert.doesNotMatch(audit, /spawn\(['"]taskkill['"]/);
  assert.match(audit, /taskkill\.exe`[\s\S]*?shell: false/);
});

test('secure IDs retain their prefix and survive point-type normalization', () => {
  const ids = new Set(Array.from({ length: 200 }, () => secureRandomId('type')));
  assert.equal(ids.size, 200);
  for (const id of ids) {
    assert.match(id, /^type-[a-f0-9]{32}$/);
    assert.equal(normalizeTeacherPointTypes([{ id, label: 'test', points: 1 }])[0].id, id);
  }
});

test('reported shared engines and dashboard components have no pseudorandom fallback', async () => {
  for (const path of [
    '../shared/login-numbers.js', '../shared/secure-random.js',
    '../src/components/dashboard/StudentsSection.jsx',
    '../src/components/dashboard/TeacherPointTypesSetting.jsx',
  ]) {
    assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /Math\.random/);
  }
});

test('secure random integers reject biased samples and validate ranges', (t) => {
  const values = [0xffffffff, 17];
  const random = t.mock.method(globalThis.crypto, 'getRandomValues', (array) => {
    array[0] = values.shift();
    return array;
  });
  assert.equal(secureRandomInt(10), 7);
  assert.equal(random.mock.callCount(), 2);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1]) {
    assert.throws(() => secureRandomInt(invalid), RangeError);
  }
});

test('secure random items handle empty and single-item arrays', () => {
  assert.equal(secureRandomItem([]), undefined);
  assert.equal(secureRandomItem(['a']), 'a');
  assert.equal(secureRandomInt(1), 0);
});
