import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coalesceAutomaticStages, defaultAutomaticTemplate, generateAutomaticRanges, resolveAutomaticRange, traverseAutomaticRange, validateAutomaticTemplate } from '../shared/quran-automatic-plan.js';

const { ayahs } = JSON.parse(readFileSync(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
const range = (surah, start, end) => resolveAutomaticRange(ayahs, { startSurah: surah, startAyah: start, endSurah: surah, endAyah: end });
const verses = ranges => ranges.flatMap(item => traverseAutomaticRange(ayahs, item)).map(item => `${item.surah}:${item.ayah}`);

test('two-juz descending template covers all 6236 ayahs exactly once in 15 ordered stages', () => {
  const template = defaultAutomaticTemplate(ayahs);
  validateAutomaticTemplate(ayahs, template);
  assert.deepEqual([...new Set(template.ranges.map(item => item.label))], Array.from({ length: 15 }, (_, i) => `الجزآن ${30 - i * 2} و${29 - i * 2}`));
  const actual = verses(template.ranges);
  assert.equal(actual.length, 6236); assert.equal(new Set(actual).size, 6236);
  assert.equal(template.ranges.length, 15, 'fifteen actual stages, not merely fifteen distinct labels');
  const ordered = [...ayahs].sort((a, b) => b.surah - a.surah || a.ayah - b.ayah).map(row => `${row.surah}:${row.ayah}`);
  assert.deepEqual(actual, ordered, 'every surah is learned from its beginning without returning to earlier ayahs');
  assert.deepEqual([template.ranges[1].endSurah, template.ranges[1].endAyah], [51, 60]);
  assert.equal(template.ranges[2].startSurah, 50, 'Dhariyat 1-30 is already assigned as advance memorization');
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


test('legacy fragmented automatic stages merge without losing unapproved ayahs or changing manual ranges', () => {
  const old = [
    { startSurah: 66, startAyah: 1, endSurah: 52, endAyah: 49, label: 'الجزآن 28 و27', automatic: true },
    { ...range(51, 31, 60), label: 'الجزآن 28 و27', automatic: true },
    { ...range(51, 1, 30), label: 'الجزآن 26 و25', automatic: true },
    { startSurah: 50, startAyah: 1, endSurah: 41, endAyah: 54, stageJuz: 26, label: 'الجزآن 26 و25', automatic: true },
  ];
  const merged = coalesceAutomaticStages(ayahs, old);
  assert.equal(merged.length, 2);
  assert.deepEqual([merged[0].endSurah, merged[0].endAyah, merged[1].startSurah], [51, 60, 50]);
  const afterWrongTail = coalesceAutomaticStages(ayahs, old.slice(2));
  assert.deepEqual([afterWrongTail[0].startSurah, afterWrongTail[0].startAyah], [51, 1]);
  assert.deepEqual(coalesceAutomaticStages(ayahs, [range(51, 31, 60)]), [range(51, 31, 60)]);
});

test('approved holes remain one automatic stage and reserved current plans never overlap it', () => {
  const template = defaultAutomaticTemplate(ayahs);
  const result = generateAutomaticRanges(ayahs, template.ranges, [range(114, 2, 4)]);
  assert.equal(result.ranges.length, 15);
  assert.equal(result.excludedAyahs, 3);
  assert.equal(result.stages[1].advanceAyahs, 30);
  const current = range(113, 1, 5);
  const held = generateAutomaticRanges(ayahs, template.ranges, [current], [current]);
  assert.ok(!verses(held.ranges).some(value => value.startsWith('113:')));
});

test('a completed official stage moves its unlearned advance into the next stage without a tiny successor', () => {
  const template = defaultAutomaticTemplate(ayahs);
  const prior = [template.ranges[0], resolveAutomaticRange(ayahs, { startSurah: 66, startAyah: 1, endSurah: 52, endAyah: 49 }), range(51, 31, 60)];
  const result = generateAutomaticRanges(ayahs, template.ranges, prior);
  assert.equal(result.ranges[0].stageJuz, 26);
  assert.deepEqual([result.ranges[0].startSurah, result.ranges[0].startAyah, result.ranges[0].endSurah], [51, 1, 41]);
  assert.ok(!result.ranges.some(item => item.stageJuz === 28));
  const partialOnly = generateAutomaticRanges(ayahs, [template.ranges[1]], prior);
  assert.equal(verses(partialOnly.ranges).length, 30, 'an intentionally truncated queue never loses its requested remaining ayahs');
});
