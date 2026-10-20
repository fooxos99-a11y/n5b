import { readFileSync } from 'node:fs';
import { getBusinessDate } from '../../shared/business-date.js';
import { buildQuranFacePositions, measureQuranFaces, quranRangeFacesSql, quranRangeFingerprintSql } from './quranFaceMeasurement.js';
import { createColumnMigration } from './columnMigration.js';
import { taskFaceQuantity } from './quranPageReference.js';

const reference = JSON.parse(readFileSync(new URL('../data/quran-pages.json', import.meta.url), 'utf8'));
const quotaColumn = createColumnMigration({ tableName: 'student_quran_tasks', columnName: 'scheduled_pages',
  addSql: 'ALTER TABLE student_quran_tasks ADD COLUMN scheduled_pages DECIMAL(7,2) NULL AFTER target_pages',
  dropSql: 'ALTER TABLE student_quran_tasks DROP COLUMN scheduled_pages' });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function writePositions(connection, positions) {
  for (let offset = 0; offset < positions.length; offset += 400) {
    const rows = positions.slice(offset, offset + 400);
    await connection.query(`INSERT INTO quran_face_positions
      (surah,ayah,forward_start,forward_end,reverse_start,reverse_end)
      VALUES ${rows.map(() => '(?,?,?,?,?,?)').join(',')}
      ON DUPLICATE KEY UPDATE forward_start=VALUES(forward_start),forward_end=VALUES(forward_end),
        reverse_start=VALUES(reverse_start),reverse_end=VALUES(reverse_end)`,
    rows.flatMap(row => [row.surah, row.ayah, row.forwardStart, row.forwardEnd, row.reverseStart, row.reverseEnd]));
  }
}

async function writeReference(connection, data) {
  for (const row of data.ayahs) {
    await connection.query('UPDATE quran_ayah_pages SET page_number=? WHERE surah_number=? AND ayah_number=? AND page_number<>?',
      [row.page, row.surah, row.ayah, row.page]);
  }
  for (const row of data.chapters) {
    await connection.query('UPDATE quran_surahs SET start_page=?,end_page=? WHERE surah_number=? AND (start_page<>? OR end_page<>?)',
      [row.startPage, row.endPage, row.number, row.startPage, row.endPage]);
  }
  await writePositions(connection, data.positions);
}

/** Snapshot first; update reference coordinates and untouched current assignments only. */
export async function upReferenceRepair(connection, version, date = getBusinessDate()) {
  await quotaColumn.up(connection);
  await connection.query(`CREATE TABLE IF NOT EXISTS quran_mushaf_reference_backups (
    version VARCHAR(40) NOT NULL PRIMARY KEY, snapshot_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS quran_task_boundary_repairs (
    task_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, version VARCHAR(40) NOT NULL,
    repair_kind VARCHAR(30) NOT NULL, snapshot_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`CREATE TABLE IF NOT EXISTS quran_task_reference_measurements (
    task_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, reference_version VARCHAR(40) NOT NULL,
    actual_faces DECIMAL(9,4) NOT NULL, expected_faces DECIMAL(9,4) NOT NULL,
    actual_range_key VARCHAR(150) NOT NULL, expected_range_key VARCHAR(150) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.beginTransaction();
  try {
    const [ayahs] = await connection.query('SELECT surah_number AS surah,ayah_number AS ayah,page_number AS page FROM quran_ayah_pages ORDER BY surah_number,ayah_number');
    const [chapters] = await connection.query('SELECT surah_number AS number,start_page AS startPage,end_page AS endPage FROM quran_surahs ORDER BY surah_number');
    const [positions] = await connection.query('SELECT surah,ayah,forward_start AS forwardStart,forward_end AS forwardEnd,reverse_start AS reverseStart,reverse_end AS reverseEnd FROM quran_face_positions ORDER BY surah,ayah');
    if (ayahs.length !== 6236 || chapters.length !== 114 || positions.length !== 6236) throw new Error('Incomplete existing Quran reference; repair stopped');
    await connection.query('INSERT IGNORE INTO quran_mushaf_reference_backups(version,snapshot_json) VALUES(?,?)',
      [version, JSON.stringify({ ayahs, chapters, positions })]);
    // Freeze existing history before changing measurement coordinates; approved rows stay untouched.
    await connection.query(`INSERT IGNORE INTO quran_task_reference_measurements(task_id,reference_version,actual_faces,expected_faces,actual_range_key,expected_range_key)
      SELECT t.id,?,${quranRangeFacesSql('t','actual',{ preserveHistorical: false })},${quranRangeFacesSql('t','expected',{ preserveHistorical: false })},
        ${quranRangeFingerprintSql('t','actual')},${quranRangeFingerprintSql('t','expected')}
      FROM student_quran_tasks t WHERE t.task_date<? OR t.teacher_completed IS NOT NULL OR t.student_status='done'
        OR t.executed_at IS NOT NULL OR t.evaluated_at IS NOT NULL
        OR t.execution_state IS NOT NULL OR t.actual_to_ayah IS NOT NULL
        OR EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id=t.id)
        OR EXISTS (SELECT 1 FROM student_quran_task_word_marks mark WHERE mark.task_id=t.id)`, [version,date]);
    const oldPages = new Map(ayahs.map(row => [`${row.surah}:${row.ayah}`, Number(row.page)]));
    await writeReference(connection, { chapters: reference.chapters, positions: buildQuranFacePositions(),
      ayahs: reference.ayahs.filter(row => oldPages.get(`${row.surah}:${row.ayah}`) !== row.page) });
    const [tasks] = await connection.query(`SELECT t.id,t.from_surah AS fromSurah,t.from_ayah AS fromAyah,
      t.to_surah AS toSurah,t.to_ayah AS toAyah,t.target_pages AS targetPages,t.scheduled_pages AS scheduledPages,
      DATE_FORMAT(t.updated_at,'%Y-%m-%d %H:%i:%s') AS updatedAt
      FROM student_quran_tasks t WHERE t.task_date>=? AND t.task_type IN ('memorization','repeat')
        AND t.student_status='pending' AND t.teacher_completed IS NULL AND t.executed_at IS NULL
        AND t.evaluated_at IS NULL AND t.execution_state IS NULL AND t.actual_to_ayah IS NULL
        AND NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id=t.id)
        AND NOT EXISTS (SELECT 1 FROM student_quran_task_word_marks mark WHERE mark.task_id=t.id)
      FOR UPDATE`, [date]);
    for (const task of tasks) {
      const quota = Number(task.scheduledPages ?? task.targetPages);
      if (!(quota > 0)) continue;
      const measured = measureQuranFaces({ surah: task.fromSurah, ayah: task.fromAyah }, { surah: task.toSurah, ayah: task.toAyah });
      const quantity = taskFaceQuantity(task, quota, measured);
      if (task.scheduledPages != null && Number(task.targetPages) === quantity) continue;
      await connection.query('INSERT IGNORE INTO quran_task_boundary_repairs(task_id,version,repair_kind,snapshot_json) VALUES(?,?,?,?)',
        [task.id, version, 'quantity', JSON.stringify({ before: task, after: { targetPages: quantity, scheduledPages: quota } })]);
      await connection.query('UPDATE student_quran_tasks SET target_pages=?,scheduled_pages=? WHERE id=?', [quantity, quota, task.id]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}

export async function downReferenceRepair(connection, version) {
  await connection.beginTransaction();
  try {
    const [[backup]] = await connection.query('SELECT snapshot_json FROM quran_mushaf_reference_backups WHERE version=?', [version]);
    if (!backup) throw new Error('Reference repair backup is missing');
    const [repairs] = await connection.query('SELECT task_id AS taskId,repair_kind AS kind,snapshot_json FROM quran_task_boundary_repairs WHERE version=?', [version]);
    if (repairs.some(row => row.kind === 'regeneration')) throw new Error('Assignments were regenerated after repair; use the reviewed database backup for rollback');
    for (const repair of repairs) {
      const { before, after } = parse(repair.snapshot_json);
      const [result] = await connection.query(`UPDATE student_quran_tasks SET target_pages=?,scheduled_pages=?,updated_at=?
        WHERE id=? AND student_status='pending' AND teacher_completed IS NULL AND executed_at IS NULL AND evaluated_at IS NULL
          AND execution_state IS NULL AND actual_to_ayah IS NULL
          AND NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id=student_quran_tasks.id)
          AND NOT EXISTS (SELECT 1 FROM student_quran_task_word_marks mark WHERE mark.task_id=student_quran_tasks.id)
          AND target_pages=? AND scheduled_pages=?`,
      [before.targetPages, before.scheduledPages, before.updatedAt, repair.taskId, after.targetPages, after.scheduledPages]);
      if (result.affectedRows !== 1) throw new Error('An assignment changed after repair; automatic rollback stopped');
    }
    await writeReference(connection, parse(backup.snapshot_json));
    await connection.query('DELETE FROM quran_task_reference_measurements WHERE reference_version=?', [version]);
    await connection.query('DELETE FROM quran_task_boundary_repairs WHERE version=?', [version]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}
