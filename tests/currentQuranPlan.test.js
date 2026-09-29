import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { currentQuranPlanSql, canContinueQuranRevision } from '../server/services/currentQuranPlan.js';

test('completed latest plans remain visible, but replacements and pauses never resurrect old plans', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE student_quran_plans (id INTEGER, student_id INTEGER, status TEXT);
      INSERT INTO student_quran_plans VALUES (1,1,'completed'),(2,2,'completed'),(3,2,'active'),(4,3,'completed'),(5,3,'paused');`);
    assert.deepEqual(db.prepare(`SELECT p.id FROM student_quran_plans p WHERE ${currentQuranPlanSql('p')} ORDER BY p.id`).all().map(row => row.id), [1,3]);
    assert.equal(canContinueQuranRevision({status:'completed'}), true);
    assert.equal(canContinueQuranRevision({status:'paused'}), false);
  } finally { db.close(); }
});
