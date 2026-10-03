import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComplexRankings } from '../server/services/complexRankings.js';

const connection = { query: async () => [[
  { id: '1', name: 'مجمع كبير', points: '120', averagePoints: '30', studentsCount: '4', committeesCount: '2' },
  { id: '2', name: 'مجمع صغير', points: '100', averagePoints: '50', studentsCount: '2', committeesCount: '1' },
  { id: '3', name: 'مجمع فارغ', points: null, averagePoints: null, studentsCount: '0', committeesCount: '0' },
]] };

test('complex rankings respect the selected total or weighted student-average mode', async () => {
  const total = await loadComplexRankings(connection, 'total');
  assert.deepEqual(total.map(row => [row.id, row.points, row.rank]), [[1, 120, 1], [2, 100, 2], [3, 0, 3]]);
  const average = await loadComplexRankings(connection, 'average');
  assert.deepEqual(average.map(row => [row.id, row.points, row.rank]), [[2, 50, 1], [1, 30, 2], [3, 0, 3]]);
  assert.equal(average[1].committeesCount, 2);
  assert.equal(average[2].studentsCount, 0);
});

test('complex ranking failures propagate so the student can retry', async () => {
  await assert.rejects(loadComplexRankings({ query: async () => { throw new Error('unavailable'); } }, 'average'), /unavailable/);
});
