import assert from 'node:assert/strict';
import test from 'node:test';
import { getMushafPagePresentation } from '../src/lib/mushafPagePresentation.js';

const word = (position, line) => ({ location: `3:110:${position}`, verseKey: '3:110', line, charType: 'word' });

test('uses the reference line breaks without mutating canonical word locations or mark indexes', () => {
  const page = { page: 64, words: [word(14, 3), word(15, 3)], decorations: [], displayLayout: { words: {
    '3:110:14': { codeV1: 'ﭬ', pageV1: 64, lineV1: 3 },
    '3:110:15': { codeV1: 'ﭭ', pageV1: 64, lineV1: 4 },
  } } };
  const original = structuredClone(page);
  const presentation = getMushafPagePresentation(page);
  assert.equal(presentation.hasV1, true);
  assert.equal(presentation.useV1Lines, true);
  assert.deepEqual(page.words.map(presentation.lineOf), [3, 4]);
  assert.deepEqual(page, original);
  assert.equal(page.words.findIndex((item) => item.location === '3:110:15'), 1);
});

test('preserves task page boundaries when the two editions put a word on different faces', () => {
  const page = { page: 64, words: [word(14, 14), word(15, 15)], decorations: [{ type: 'bismillah', line: 1 }], displayLayout: { words: {
    '3:110:14': { codeV1: 'ﭬ', pageV1: 64, lineV1: 15 },
    '3:110:15': { codeV1: 'ﭭ', pageV1: 65, lineV1: 1 },
  } } };
  const original = structuredClone(page);
  const presentation = getMushafPagePresentation(page);
  assert.equal(presentation.hasV1, true);
  assert.equal(presentation.useV1Lines, false);
  assert.deepEqual(page.words.map(presentation.lineOf), [14, 15]);
  assert.deepEqual(presentation.decorations, page.decorations);
  assert.deepEqual(page, original);
});

test('keeps canonical presentation available when supplementary calligraphy is incomplete', () => {
  const page = { page: 64, words: [word(14, 3), word(15, 3)], decorations: [], displayLayout: { words: {
    '3:110:14': { codeV1: 'ﭬ', pageV1: 64, lineV1: 3 },
  } } };
  const presentation = getMushafPagePresentation(page);
  assert.equal(presentation.hasV1, false);
  assert.equal(presentation.useV1Lines, false);
  assert.deepEqual(page.words.map(presentation.lineOf), [3, 3]);
});
