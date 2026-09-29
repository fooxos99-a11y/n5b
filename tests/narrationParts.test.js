import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNarrationParts, narrationOverallScore, narrationRangeLabel } from '../src/lib/narrationParts.js';

test('narration groups disconnected ranges by juz without filling gaps or changing evaluations', () => {
  const parts = [
    { id: 1, juzNumber: 30, startSurah: 112, startAyah: 1, endSurah: 114, endAyah: 6, score: 90 },
    { id: 2, juzNumber: 29, startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50 },
    { id: 3, juzNumber: 30, startSurah: 78, startAyah: 1, endSurah: 78, endAyah: 20, score: null },
  ];
  const snapshot = structuredClone(parts);
  const groups = groupNarrationParts(parts);
  assert.deepEqual(groups.map(group => group.juzNumber), [29, 30]);
  assert.deepEqual(groups[1].parts.map(part => part.id), [3, 1]);
  assert.equal(groups[1].parts[0].endAyah, 20);
  assert.equal(groups[1].parts[1].score, 90);
  assert.deepEqual(parts, snapshot);
});

test('partial final juz shows its exact memorized endpoint and empty students stay empty', () => {
  assert.equal(narrationRangeLabel({ startSurahName: 'النبأ', endSurahName: 'النبأ', startAyah: 1, endAyah: 20 }), 'من النبأ 1 إلى النبأ 20');
  assert.deepEqual(groupNarrationParts([]), []);
});

test('each juz carries one score however many separate segments it contains', () => {
  const groups = groupNarrationParts([
    { id: 1, juzNumber: 1, startSurah: 2, startAyah: 30, score: 90, mistakeCount: 2, warningCount: 0 },
    { id: 2, juzNumber: 1, startSurah: 2, startAyah: 1, score: 90, mistakeCount: 0, warningCount: 0 },
    { id: 3, juzNumber: 1, startSurah: 2, startAyah: 90, score: 90, mistakeCount: 0, warningCount: 1 },
    { id: 4, juzNumber: 30, startSurah: 78, startAyah: 1, score: 70 },
  ]);
  assert.deepEqual(groups.map((group) => [group.juzNumber, group.parts.length, group.score, group.evaluated]), [[1, 3, 90, true], [30, 1, 70, true]]);
  assert.equal(groups[0].mistakeCount, 2);
  assert.equal(groups[0].warningCount, 1);
  // Three segments of juz 1 do not outweigh the single segment of juz 30.
  assert.equal(narrationOverallScore(groups), 80);
  assert.equal(narrationOverallScore(groupNarrationParts([{ id: 5, juzNumber: 2, score: null }])), null);
});
