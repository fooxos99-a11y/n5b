import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelectedAyahMarks, normalizeSelectedWordMarks } from '../server/services/recitationMarks.js';

test('ayah marks reject out-of-task verses and nonfinite counts, and preserve bounded aggregation', () => {
  const allowed = new Map([['1:1', {}]]), marks = new Map();
  normalizeSelectedAyahMarks([{ surah: 1, ayah: 1, mistakeCount: 2.9, warningCount: -1 }, { surah: 1, ayah: 1, mistakeCount: 1 }], allowed, marks, 1000);
  assert.deepEqual(marks.get('1:1'), { surah: 1, ayah: 1, mistakeCount: 3, warningCount: 0 });
  for (const mark of [{ surah: 2, ayah: 1 }, { surah: 1, ayah: 1, mistakeCount: 'not a number' }, { surah: 1, ayah: 1, warningCount: Infinity }]) {
    assert.throws(() => normalizeSelectedAyahMarks([mark], allowed, new Map(), 1000), { statusCode: 422 });
  }
});

test('word selections normalize reversed endpoints and reject ranges crossing unassigned verses', () => {
  const words = [1, 2, 3].map(position => ({ location: `1:1:${position}`, verseKey: '1:1', page: 1, position, charType: 'word', textQpcHafs: 'كلمة' }));
  words.push({ location: '1:2:1', verseKey: '1:2', page: 1, position: 1 });
  const context = { words, wordIndexByLocation: new Map(words.map((word, index) => [word.location, index])), allowedByKey: new Map([['1:1', {}]]) };
  const normalizedWordMarks = [], marksByKey = new Map();
  normalizeSelectedWordMarks({ ...context, normalizedWordMarks, marksByKey, wordMarksPayload: [{ startLocation: '1:1:3', endLocation: '1:1:1', markType: 'warning', notes: 'x'.repeat(600) }] });
  assert.equal(normalizedWordMarks[0].startWordPosition, 1);
  assert.equal(normalizedWordMarks[0].endWordPosition, 3);
  assert.equal(normalizedWordMarks[0].notes.length, 500);
  assert.equal(marksByKey.get('1:1').warningCount, 1);
  for (const mark of [
    { startLocation: 'missing', endLocation: '1:1:1', markType: 'warning' },
    { startLocation: '1:1:1', endLocation: '1:2:1', markType: 'warning' },
    { startLocation: '1:1:1', endLocation: '1:1:1', markType: 'invalid' },
  ]) {
    assert.throws(() => normalizeSelectedWordMarks({ ...context, normalizedWordMarks: [], marksByKey: new Map(), wordMarksPayload: [mark] }), { statusCode: 422 });
  }
});
