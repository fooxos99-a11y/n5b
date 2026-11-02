import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { currentQuranPlanSql, canContinueQuranRevision, pendingSessionQuranPlanSql } from '../server/services/currentQuranPlan.js';

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

test('queued next-day plans retain the prior session revision without reviving paused or manually replaced plans', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE student_quran_plans (id INTEGER, student_id INTEGER, status TEXT,
      previous_plan_id INTEGER, queue_parent_id INTEGER, start_date TEXT, effective_from TEXT);
      CREATE TABLE student_quran_tasks (id INTEGER, plan_id INTEGER, task_type TEXT);
      INSERT INTO student_quran_plans VALUES
        (1,1,'completed',NULL,NULL,'2026-10-27','2026-10-27'),
        (2,1,'active',1,1,'2026-11-02','2026-11-02');
      INSERT INTO student_quran_tasks VALUES (1,1,'memorization'),(2,1,'review'),(3,1,'link');`);
    const select = date => db.prepare(`SELECT t.id FROM student_quran_tasks t JOIN student_quran_plans p ON p.id=t.plan_id
      WHERE ${pendingSessionQuranPlanSql()} ORDER BY t.id`).all(date).map(row => row.id);
    assert.deepEqual(select('2026-11-01'), [2,3]);
    assert.deepEqual(select('2026-11-02'), [], 'the old plan must not leak into the next session');
    db.exec("UPDATE student_quran_plans SET status='paused' WHERE id=2");
    assert.deepEqual(select('2026-11-01'), []);
    db.exec("UPDATE student_quran_plans SET status='active', queue_parent_id=NULL WHERE id=2");
    assert.deepEqual(select('2026-11-01'), [], 'a manual replacement is not a queued completion');
    db.exec("UPDATE student_quran_plans SET queue_parent_id=1, student_id=2 WHERE id=2");
    assert.deepEqual(select('2026-11-01'), [], 'successors must belong to the same student');
    db.exec("UPDATE student_quran_plans SET student_id=1 WHERE id=2; UPDATE student_quran_plans SET status='paused' WHERE id=1");
    assert.deepEqual(select('2026-11-01'), [], 'manually skipped parents stay paused');
    assert.throws(() => pendingSessionQuranPlanSql('p; DROP TABLE students'), /Invalid/);
    assert.throws(() => pendingSessionQuranPlanSql('p', 't.id'), /Invalid/);
  } finally { db.close(); }
});
