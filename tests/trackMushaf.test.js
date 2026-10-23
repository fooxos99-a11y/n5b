import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrackMushaf, normalizeTrackSegmentMarks } from '../server/services/trackMushaf.js';
import { trackWordMarkCounts, updateTrackWordMarks } from '../shared/track-word-marks.js';
import { evaluateTrackSession } from '../shared/grading-engine.js';

const range = { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 };
const connection = { async query() { return [Array.from({ length: 7 }, (_, index) => ({ surah: 2, ayah: index + 1, page: 2, juz: 1 }))]; } };
const segment = { range, mistakes: 0, warnings: 0, hesitations: 0, recorded: true };
const wordMark = (word, markType = 'mistake') => ({ page: word.page, startLocation: word.location, endLocation: word.location, markType });

test('track Mushaf uses packaged words and the exact allowed verse range', async () => {
  const data = await loadTrackMushaf(connection, range);
  assert.deepEqual(data.allowedRange, range);
  assert.ok(data.pages.some(page => page.words.some(word => word.verseKey === '2:1')));
  assert.deepEqual(data.wordMarks, []);
});

test('word counts follow add/change/remove without losing additional manual counts', () => {
  let item = updateTrackWordMarks({ ...segment, warnings: 2 }, [{ markType: 'mistake' }, { markType: 'warning' }, { markType: 'hesitation' }, { markType: 'lahn' }]);
  assert.deepEqual([item.mistakes, item.warnings, item.hesitations], [2, 3, 1]);
  item = updateTrackWordMarks(item, [{ markType: 'hesitation' }]);
  assert.deepEqual([item.mistakes, item.warnings, item.hesitations], [0, 2, 1]);
  item = updateTrackWordMarks(item, []);
  assert.deepEqual([item.mistakes, item.warnings, item.hesitations], [0, 2, 0]);
  assert.deepEqual(trackWordMarkCounts(), { mistakes: 0, warnings: 0, hesitations: 0 });
});

test('server canonicalizes text/page, enforces marked counts, and keeps marks in the grading result', async () => {
  const data = await loadTrackMushaf(connection, range);
  const words = data.pages.flatMap(page => page.words).filter(word => word.charType === 'word' && word.verseKey === '2:2');
  const wordMarks = ['mistake', 'warning', 'hesitation', 'lahn'].map((type, index) => ({ ...wordMark(words[index], type), page: 604, selectedText: 'untrusted', notes: '  ملاحظة  ' }));
  const [clean] = await normalizeTrackSegmentMarks(connection, [{ ...segment, wordMarks }]);
  assert.deepEqual([clean.mistakes, clean.warnings, clean.hesitations], [2, 1, 1]);
  assert.ok(clean.wordMarks.every(mark => mark.page === 2 && mark.selectedText !== 'untrusted' && mark.notes === 'ملاحظة'));
  const result = evaluateTrackSession({ trackSession: { segments: [{ source: 'link', max: 10 }] } }, { attended: true, segments: [clean] });
  assert.deepEqual(result.segments[0].wordMarks, clean.wordMarks);
  assert.equal(result.segments[0].mistakes, 2);
  assert.ok(result.segments[0].grade < 10);
});

test('invalid, overlapping, excessive and out-of-range word selections are rejected', async () => {
  const data = await loadTrackMushaf(connection, range);
  const words = data.pages.flatMap(page => page.words).filter(word => word.charType === 'word');
  const valid = wordMark(words.find(word => word.verseKey === '2:2'));
  const outside = wordMark(words.find(word => word.verseKey === '2:5'));
  for (const wordMarks of [null, {}, Array(1001).fill(valid), [outside], [valid, valid], [{ ...valid, markType: 'invalid' }], [{ ...valid, startLocation: '114:6:999' }], [{ ...valid, endLocation: outside.endLocation }]]) {
    await assert.rejects(normalizeTrackSegmentMarks(connection, [{ ...segment, range: { ...range, toAyah: 4 }, wordMarks }]), error => error.status === 422 || error.statusCode === 422);
  }
  assert.deepEqual(await normalizeTrackSegmentMarks(connection, [segment]), [segment]);
  assert.deepEqual((await normalizeTrackSegmentMarks(connection, [{ ...segment, wordMarks: [] }]))[0].wordMarks, []);
});
