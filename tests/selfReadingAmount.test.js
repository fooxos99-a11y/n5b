import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMemorizedReading } from '../server/services/selfReadingAmount.js';
import { resolveReadingHizbs } from '../server/services/selfReadingHizbs.js';
import { evaluateReading } from '../shared/grading-engine.js';
import { hizbOfAyah } from '../shared/quran-hizbs.js';
import layout from '../server/data/quranVerseLineLayout.js';

const ayahs = layout.map(([key, page]) => {
  const [surah, ayah] = key.split(':').map(Number);
  return { surah, ayah, page };
});
const maidah = { startSurah: 5, startAyah: 1, endSurah: 5, endAyah: 5 };
const arafToNas = { startSurah: 7, startAyah: 1, endSurah: 114, endAyah: 6 };
const resolve = (memorized, extra = {}) => resolveMemorizedReading({ ayahs, memorized, faces: 10, hizbs: 2, ...extra });

test('a five-ayah fragment does not consume one of the two daily ahzab', () => {
  const amount = resolve([maidah, arafToNas]);
  assert.deepEqual(amount.ranges[0], { ...maidah, startPage: 106, endPage: 107, startSurahName: undefined, endSurahName: undefined });
  assert.equal(amount.ranges[1].startAyah, 1);
  assert.ok(amount.ranges[1].endAyah > 87);
  assert.ok(amount.faces >= 20);
  assert.equal(amount.hizbCount, 2);
  assert.deepEqual(resolve([maidah, arafToNas, maidah, arafToNas]), amount);
  const next = resolve([maidah, arafToNas], { previous: amount.cursor });
  assert.equal(next.ranges[0].startAyah, amount.ranges[1].endAyah + 1);
  assert.equal(next.hizbCount, 2);
  assert.equal(next.cursor, '9:25');
  assert.equal(next.faces, 19.5, 'Two Quran ahzab need not have a fixed twenty-face length');
});

test('each whole Quran hizb retains its exact boundaries, including surah crossings and the last hizb', () => {
  for (let hizb = 1; hizb <= 60; hizb++) {
    const { range } = resolveReadingHizbs(hizb, hizb);
    const amount = resolve([range], { hizbs: 1 });
    const first = amount.ranges[0], last = amount.ranges.at(-1);
    assert.deepEqual([first.startSurah, first.startAyah, last.endSurah, last.endAyah], [range.startSurah, range.startAyah, range.endSurah, range.endAyah], `hizb ${hizb}`);
    assert.equal(amount.hizbCount, 1, `hizb ${hizb}`);
  }
  const amount = resolve([arafToNas]);
  assert.equal(amount.cursor, '7:170');
  assert.equal(amount.faces, 22);
});

test('insufficient memorization earns only a fractional hizb and a proportional grade', () => {
  const amount = resolve([maidah]);
  assert.equal(amount.faces, 1.75);
  assert.ok(amount.hizbCount > 0 && amount.hizbCount < 0.25);
  const result = evaluateReading({ weeklyProgram: { readingDaily: 2 } }, {
    completed: true, requiredFaces: amount.faces, expectedFaces: 10, requiredHizbs: amount.hizbCount, expectedHizbs: 2,
  });
  assert.ok(result.grade > 0 && result.grade < 0.25);
  assert.equal(evaluateReading({}, { completed: false, requiredHizbs: amount.hizbCount, expectedHizbs: 2 }).grade, 0);
  assert.equal(resolve([]).faces, 0);
});

test('disjoint and overlapping fragments in one hizb never become a whole hizb', () => {
  const fragments = [maidah, { startSurah: 5, startAyah: 3, endSurah: 5, endAyah: 5 },
    { startSurah: 5, startAyah: 20, endSurah: 5, endAyah: 22 }];
  const amount = resolve(fragments);
  assert.equal(amount.ranges.length, 2);
  assert.ok(amount.hizbCount > 0 && amount.hizbCount < 1);
  assert.deepEqual(resolve([...fragments, ...fragments]), amount);
  assert.ok(amount.ranges.every(range => hizbOfAyah(range.startSurah, range.startAyah) === 11));
});

test('reverse traversal and wraparound fill the daily amount without repeating available verses', () => {
  const range = { startSurah: 114, startAyah: 1, endSurah: 110, endAyah: 3 };
  const amount = resolve([range], { direction: -1 });
  assert.equal(amount.ranges[0].startSurah, 114);
  assert.equal(amount.ranges.at(-1).endSurah, 110);
  assert.ok(amount.hizbCount < 1);
  const wrapped = resolve([maidah, arafToNas], { previous: '114:6' });
  assert.equal(wrapped.ranges[0].startSurah, 5);
  assert.equal(wrapped.hizbCount, 2);
  const fullReverse = resolve([arafToNas], { direction: -1 });
  assert.equal(fullReverse.ranges[0].startSurah, 114);
  assert.equal(fullReverse.hizbCount, 2);
  assert.ok(fullReverse.faces >= 20);
});

test('legacy face-based plans keep their ten-face target and cursor', () => {
  const memorized = [{ startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 286 }];
  const amount = resolve(memorized, { hizbs: null });
  assert.equal(amount.faces, 10);
  assert.equal(amount.ranges.at(-1).endPage, 10);
  assert.equal(resolve(memorized, { hizbs: null, previous: amount.cursor }).ranges[0].startPage, 11);
});
