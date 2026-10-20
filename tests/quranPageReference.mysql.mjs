import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { upReferenceRepair, downReferenceRepair } from '../server/services/quranReferenceRepair.js';
import { buildQuranFacePositions, quranRangeFacesSql } from '../server/services/quranFaceMeasurement.js';

const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.match(database || '', /^quran_audit_page_reference_[a-z0-9_]+$/);
assert.equal(process.env.QURAN_TEST_MYSQL_HOST, '127.0.0.1');
const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
  user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', dateStrings: true });
const version = 'test-page-reference';
const canonical = JSON.parse(await readFile(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
// Reproduce the stale boundary independently of Git history, so this test survives the fix's commit.
const original = { ...canonical, ayahs: canonical.ayahs.map(row => row.surah === 6 && row.ayah === 131 ? { ...row, page: 144 } : row) };
const legacyPositions = buildQuranFacePositions();
const previous = legacyPositions.find(row => row.surah === 6 && row.ayah === 130);
Object.assign(legacyPositions.find(row => row.surah === 6 && row.ayah === 131), {
  forwardStart: previous.forwardEnd, forwardEnd: previous.forwardEnd,
  reverseStart: previous.reverseEnd, reverseEnd: previous.reverseEnd,
});
const readTasks = async () => (await connection.query('SELECT * FROM student_quran_tasks ORDER BY id'))[0];
try {
  const [existing] = await connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name=?', [database]);
  assert.equal(existing.length, 0, 'Integration database must be newly isolated');
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.changeUser({ database });
  await connection.query('CREATE TABLE quran_ayah_pages(surah_number INT,ayah_number INT,page_number INT,PRIMARY KEY(surah_number,ayah_number))');
  await connection.query('CREATE TABLE quran_surahs(surah_number INT PRIMARY KEY,start_page INT,end_page INT)');
  await connection.query(`CREATE TABLE quran_face_positions(surah INT,ayah INT,forward_start INT,forward_end INT,reverse_start INT,reverse_end INT,PRIMARY KEY(surah,ayah))`);
  await connection.query(`CREATE TABLE student_quran_tasks(id BIGINT UNSIGNED PRIMARY KEY,task_date DATE,task_type VARCHAR(30),student_status VARCHAR(30),teacher_completed INT NULL,
    executed_at DATETIME NULL,evaluated_at DATETIME NULL,execution_state VARCHAR(30) NULL,actual_to_ayah INT NULL,actual_to_surah INT NULL,actual_to_page INT NULL,review_execution_json JSON NULL,
    from_surah INT,from_ayah INT,to_surah INT,to_ayah INT,target_pages DECIMAL(7,2),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
  await connection.query('CREATE TABLE student_quran_recitation_attempts(task_id BIGINT UNSIGNED,is_official INT)');
  await connection.query('CREATE TABLE student_quran_task_word_marks(task_id BIGINT UNSIGNED)');
  await connection.query('CREATE TABLE student_daily_grades(id INT PRIMARY KEY,score DECIMAL(7,2),detail_json JSON)');
  await connection.query('INSERT INTO quran_ayah_pages VALUES ?', [original.ayahs.map(row => [row.surah, row.ayah, row.page])]);
  await connection.query('INSERT INTO quran_surahs VALUES ?', [original.chapters.map(row => [row.number, row.startPage, row.endPage])]);
  await connection.query('INSERT INTO quran_face_positions VALUES ?', [legacyPositions.map(row => [row.surah,row.ayah,row.forwardStart,row.forwardEnd,row.reverseStart,row.reverseEnd])]);
  await connection.query(`INSERT INTO student_quran_tasks(id,task_date,task_type,student_status,teacher_completed,executed_at,evaluated_at,execution_state,actual_to_ayah,from_surah,from_ayah,to_surah,to_ayah,target_pages) VALUES
    (1,'2026-10-17','memorization','done',1,'2026-10-17 12:00:00','2026-10-17 12:00:00','complete',131,6,125,6,131,1),
    (2,'2026-10-20','memorization','pending',NULL,NULL,NULL,NULL,NULL,6,132,6,137,1),
    (3,'2026-10-20','memorization','pending',0,NULL,'2026-10-20 12:00:00',NULL,NULL,6,132,6,137,1),
    (4,'2026-10-20','memorization','pending',NULL,'2026-10-20 12:00:00',NULL,'partial',135,6,132,6,137,1),
    (5,'2026-10-20','repeat','pending',NULL,NULL,NULL,NULL,NULL,6,132,6,137,1),
    (6,'2026-10-21','memorization','pending',NULL,NULL,NULL,NULL,NULL,6,132,6,135,0.5),
    (7,'2026-10-18','memorization','pending',NULL,NULL,NULL,NULL,NULL,6,132,6,137,1),
    (8,'2026-10-20','memorization','pending',NULL,NULL,NULL,NULL,NULL,6,132,6,137,1),
    (9,'2026-10-20','memorization','pending',NULL,NULL,NULL,'partial',NULL,6,132,6,137,1),
    (10,'2026-10-20','memorization','pending',NULL,NULL,NULL,NULL,135,6,132,6,137,1),
    (11,'2026-10-20','memorization','pending',NULL,NULL,NULL,NULL,NULL,114,1,112,4,1)`);
  await connection.query('INSERT INTO student_quran_recitation_attempts VALUES(5,0)');
  await connection.query('INSERT INTO student_quran_task_word_marks VALUES(8)');
  await connection.query('INSERT INTO student_daily_grades VALUES(1,97.5,?)', [JSON.stringify({ immutable: 'approved grade', faces: 1 })]);
  const before = await readTasks();
  const [oldMeasurements] = await connection.query(`SELECT t.id,${quranRangeFacesSql('t','actual',{ preserveHistorical: false })} AS actual,
    ${quranRangeFacesSql('t','expected',{ preserveHistorical: false })} AS expected FROM student_quran_tasks t WHERE t.id IN (1,3,4,5,7,8,9,10) ORDER BY t.id`);
  const [gradeBefore] = await connection.query('SELECT * FROM student_daily_grades');
  await upReferenceRepair(connection, version, '2026-10-20');
  const after = await readTasks();
  const [newMeasurements] = await connection.query(`SELECT t.id,${quranRangeFacesSql('t','actual')} AS actual,
    ${quranRangeFacesSql('t','expected')} AS expected FROM student_quran_tasks t WHERE t.id IN (1,3,4,5,7,8,9,10) ORDER BY t.id`);
  assert.deepEqual(newMeasurements, oldMeasurements, 'Historical totals survive the coordinate correction');
  for (const id of [1,3,4,5,7,8,9,10]) assert.deepEqual(after.find(row => row.id === id), { ...before.find(row => row.id === id), scheduled_pages: null });
  assert.equal(Number(after.find(row => row.id === 2).target_pages), 0.75);
  assert.equal(Number(after.find(row => row.id === 2).scheduled_pages), 1);
  assert.equal(Number(after.find(row => row.id === 6).target_pages), 0.5);
  assert.equal(Number(after.find(row => row.id === 11).target_pages), 1, 'A complete descending face must not become a partial face');
  assert.deepEqual((await connection.query('SELECT * FROM student_daily_grades'))[0], gradeBefore);
  const [rows] = await connection.query('SELECT surah_number AS surah,ayah_number AS ayah,page_number AS page FROM quran_ayah_pages ORDER BY surah_number,ayah_number');
  assert.deepEqual(rows, canonical.ayahs.map(({ surah,ayah,page }) => ({ surah,ayah,page })));
  await upReferenceRepair(connection, version, '2026-10-20');
  assert.deepEqual(await readTasks(), after, 'Repair is idempotent');
  await downReferenceRepair(connection, version);
  const restored = await readTasks();
  assert.deepEqual(restored, before.map(row => ({ ...row, scheduled_pages: null })));
  const [[oldBoundary]] = await connection.query('SELECT page_number AS page FROM quran_ayah_pages WHERE surah_number=6 AND ayah_number=131');
  assert.equal(oldBoundary.page, 144);
  await upReferenceRepair(connection, version, '2026-10-20');
  await connection.query("UPDATE student_quran_tasks SET teacher_completed=1,student_status='done' WHERE id=2");
  await assert.rejects(downReferenceRepair(connection, version), /assignment changed/);
  const [[stillCorrect]] = await connection.query('SELECT page_number AS page FROM quran_ayah_pages WHERE surah_number=6 AND ayah_number=131');
  assert.equal(stillCorrect.page, 145);
  assert.deepEqual((await connection.query('SELECT * FROM student_daily_grades'))[0], gradeBefore);
  process.stdout.write(`${JSON.stringify({ database, referenceAyahs: 6236, approvedRecordsPreserved: true, activeAttemptsPreserved: true,
    historicalPendingPreserved: true, pendingRemainderCorrected: true, idempotencePassed: true,
    rollbackPassed: true, rollbackAfterEvaluationBlocked: true })}\n`);
} finally { await connection.end(); }
