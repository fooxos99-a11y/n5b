import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultAutomaticTemplate, generateAutomaticRanges, resolveAutomaticRange, traverseAutomaticRange, validateAutomaticTemplate } from '../shared/quran-automatic-plan.js';

const { ayahs } = JSON.parse(readFileSync(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
const range = (surah, start, end) => resolveAutomaticRange(ayahs, { startSurah: surah, startAyah: start, endSurah: surah, endAyah: end });
const verses = ranges => ranges.flatMap(item => traverseAutomaticRange(ayahs, item)).map(item => `${item.surah}:${item.ayah}`);

test('two-juz descending template covers all 6236 ayahs exactly once in 15 ordered stages', () => {
  const template = defaultAutomaticTemplate(ayahs);
  validateAutomaticTemplate(ayahs, template);
  assert.deepEqual([...new Set(template.ranges.map(item => item.label))], Array.from({ length: 15 }, (_, i) => `الجزآن ${30 - i * 2} و${29 - i * 2}`));
  const actual = verses(template.ranges);
  assert.equal(actual.length, 6236); assert.equal(new Set(actual).size, 6236);
  for (const item of template.ranges) {
    const numbers = item.label.match(/\d+/g).map(Number);
    assert.ok(traverseAutomaticRange(ayahs, item).every(row => numbers.includes(row.juz)), 'A mid-surah juz boundary never leaks into the adjacent stage');
  }
  assert.equal(actual[0], '114:1'); assert.equal(actual.at(-1), '1:7');
});

test('fully memorized stages disappear and partial and middle intervals split precisely by ayah', () => {
  const input = [range(114, 1, 6), range(113, 1, 5), range(112, 1, 4)];
  const generated = generateAutomaticRanges(ayahs, input, [range(114, 1, 6), range(113, 2, 4), range(112, 1, 1)]);
  assert.deepEqual(verses(generated.ranges), ['113:1', '113:5', '112:2', '112:3', '112:4']);
  assert.equal(generated.ranges.length, 3); assert.equal(generated.excludedAyahs, 10);
  assert.ok(generated.ranges.every(item => item.automatic));
});

test('current plan is reserved, repeated prior ranges do not double-count, and the source is unchanged', () => {
  const template = defaultAutomaticTemplate(ayahs), original = JSON.stringify(template);
  const prior = range(114, 1, 6);
  const result = generateAutomaticRanges(ayahs, template.ranges, [prior, prior], [range(113, 1, 5)]);
  assert.equal(result.excludedAyahs, 6);
  assert.equal(verses(result.ranges).length, 6236 - 11);
  assert.equal(JSON.stringify(template), original);
});

test('an entirely memorized template produces no empty plans', () => {
  const template = defaultAutomaticTemplate(ayahs);
  const result = generateAutomaticRanges(ayahs, template.ranges, [{ startSurah: 1, startAyah: 1, endSurah: 114, endAyah: 6 }]);
  assert.deepEqual(result.ranges, []); assert.equal(result.excludedAyahs, 6236);
});

test('invalid bounds, duplicate and intersecting stages are rejected while disjoint same-surah stages are allowed', () => {
  for (const ranges of [[{}], [range(2, 1, 10), range(2, 10, 20)], [range(114, 1, 6), range(114, 1, 6)], []]) {
    assert.throws(() => validateAutomaticTemplate(ayahs, { name: 'قالب', ranges }), { statusCode: 422 });
  }
  assert.throws(() => resolveAutomaticRange(ayahs, { startSurah: 114, startAyah: 7, endSurah: 114, endAyah: 9 }), { statusCode: 422 });
  validateAutomaticTemplate(ayahs, { name: 'قالب', ranges: [range(2, 1, 10), range(2, 11, 20)] });
});

test('custom order and page-based prior memorization retain exact ayah boundaries', () => {
  const result = generateAutomaticRanges(ayahs, [range(112, 1, 4), range(114, 1, 6)], [{ startPage: 604, endPage: 604 }]);
  assert.deepEqual(verses(result.ranges), []);
  assert.deepEqual(verses(generateAutomaticRanges(ayahs, [range(112, 1, 4), range(114, 1, 6)]).ranges), ['112:1', '112:2', '112:3', '112:4', '114:1', '114:2', '114:3', '114:4', '114:5', '114:6']);
});
