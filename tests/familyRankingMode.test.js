import assert from 'node:assert/strict';
import test from 'node:test';
import { rankFamilies } from '../shared/family-rankings.js';

const families = [
  { id: 1, name: 'حلقة كبيرة', points: 10000, averagePoints: 100, studentsCount: 100 },
  { id: 2, name: 'حلقة صغيرة', points: 5000, averagePoints: 100, studentsCount: 50 },
  { id: 3, name: 'حلقة متفوقة', points: 4500, averagePoints: 150, studentsCount: 30 },
];

test('family rankings can use totals or the student average', () => {
  assert.deepEqual(rankFamilies(families, 'total').map(({ id, points }) => ({ id, points })), [
    { id: 1, points: 10000 },
    { id: 2, points: 5000 },
    { id: 3, points: 4500 },
  ]);
  assert.deepEqual(rankFamilies(families, 'average').map(({ id, points }) => ({ id, points })), [
    { id: 3, points: 150 },
    { id: 1, points: 100 },
    { id: 2, points: 100 },
  ]);
});
