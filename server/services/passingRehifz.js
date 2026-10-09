import { readQuranRange } from './quranReferenceCache.js';
import { assertSupervisorStudentScope } from './supervisorStudentScope.js';
import { currentQuranPlanSql } from './currentQuranPlan.js';
import { getBusinessDate } from '../../shared/business-date.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (message, status = 422) => Object.assign(new Error(message), { status, statusCode: status });
const key = row => Number(row.surah) * 1000 + Number(row.ayah);
const covered = (ayah, ranges) => ranges.some(range => key(ayah) >= range.startSurah * 1000 + range.startAyah && key(ayah) <= range.endSurah * 1000 + range.endAyah);

export async function assertWholePassingPart(connection, part) {
  const ayahs = (await readQuranRange(connection, 1, 604)).filter(row => row.juz === Number(part.juzNumber));
  const ranges = parse(part.ranges);
  if (!ayahs.length || ayahs.some(ayah => !covered(ayah, ranges))
    || ranges.some(range => !ayahs.some(ayah => key(ayah) === range.startSurah * 1000 + range.startAyah)
      || !ayahs.some(ayah => key(ayah) === range.endSurah * 1000 + range.endAyah))) {
    throw fail('هذا الاجتياز لا يشمل جزءًا كاملًا. الاجتياز وإعادة الحفظ لجزء كامل فقط.');
  }
  return ayahs;
}

export async function decidePassingRehifz(pool, { partId, attemptId, repeat, actor, date = getBusinessDate() }) {
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0 || typeof repeat !== 'boolean') throw fail('حدد قرار إعادة الحفظ بصورة صحيحة.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[part]] = await connection.query(`SELECT p.id, p.juz_number AS juzNumber, p.ranges_json AS ranges, s.id AS studentId
      FROM student_passing_parts p JOIN student_passing_exams e ON e.id=p.exam_id JOIN students s ON s.id=e.student_id WHERE p.id=? FOR UPDATE`, [partId]);
    if (!part) throw fail('الجزء غير موجود.', 404);
    await assertSupervisorStudentScope(connection, actor, { studentId: part.studentId });
    const [[attempt]] = await connection.query('SELECT id, rehifz_decision AS decision, rehifz_id AS rehifzId FROM student_passing_attempts WHERE id=? AND part_id=? FOR UPDATE', [attemptId, partId]);
    if (!attempt) throw fail('المحاولة غير موجودة.', 404);
    const decision = repeat ? 'repeat' : 'keep';
    if (attempt.decision !== 'pending') {
      if (attempt.decision !== decision) throw fail('حُفظ قرار هذه المحاولة بالفعل. حدّث الاجتياز.', 409);
      await connection.commit(); return { decision, rehifzId: attempt.rehifzId };
    }
    const [[latest]] = await connection.query('SELECT MAX(id) AS id FROM student_passing_attempts WHERE part_id=?', [partId]);
    if (Number(latest.id) !== attemptId) throw fail('تغيّرت نتيجة الجزء. حدّث الاجتياز.', 409);
    let rehifzId = null;
    if (repeat) {
      await assertWholePassingPart(connection, part);
      const [[plan]] = await connection.query(`SELECT p.id FROM student_quran_plans p WHERE p.student_id=? AND ${currentQuranPlanSql('p')} FOR UPDATE`, [part.studentId]);
      if (!plan) throw fail('أضف خطة للطالب قبل طلب إعادة الحفظ.');
      const [[existing]] = await connection.query("SELECT id FROM student_passing_rehifz WHERE student_id=? AND juz_number=? AND status='pending' FOR UPDATE", [part.studentId, part.juzNumber]);
      if (existing) rehifzId = existing.id;
      else {
        const [saved] = await connection.query(`INSERT INTO student_passing_rehifz(student_id,plan_id,attempt_id,juz_number,ranges_json,requested_date) VALUES(?,?,?,?,?,?)`,
          [part.studentId, plan.id, attemptId, part.juzNumber, JSON.stringify(parse(part.ranges)), date]);
        rehifzId = saved.insertId;
      }
    }
    await connection.query('UPDATE student_passing_attempts SET rehifz_decision=?,rehifz_id=? WHERE id=?', [decision, rehifzId, attemptId]);
    await connection.commit(); return { decision, rehifzId };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

async function rehifzProgress(connection, revision) {
  const ranges = parse(revision.ranges);
  const ayahs = (await readQuranRange(connection, 1, 604)).filter(ayah => covered(ayah, ranges));
  const [accepted] = await connection.query(`SELECT from_surah AS startSurah,from_ayah AS startAyah,
    COALESCE(actual_to_surah,to_surah) AS endSurah,COALESCE(actual_to_ayah,to_ayah) AS endAyah
    FROM student_quran_tasks WHERE passing_rehifz_id=? AND task_type='memorization' AND teacher_completed=1`, [revision.id]);
  return { ayahs, accepted, remaining: ayahs.filter(ayah => !covered(ayah, accepted)) };
}

/** Only fresh teacher approvals satisfy this request; historic memorization stays intact. */
export async function refreshPassingRehifz(connection, id, date = getBusinessDate()) {
  const [[revision]] = await connection.query("SELECT id,ranges_json AS ranges,status FROM student_passing_rehifz WHERE id=? FOR UPDATE", [id]);
  if (!revision || revision.status === 'completed') return;
  const progress = await rehifzProgress(connection, revision);
  if (progress.ayahs.length && !progress.remaining.length) await connection.query("UPDATE student_passing_rehifz SET status='completed',completed_date=? WHERE id=?", [date, id]);
}

/** Schedule the whole juz in daily face amounts, without moving the original plan cursor. */
export async function ensurePassingRehifzTasks(connection, options) {
  if (typeof connection.getConnection !== 'function') return scheduleRehifzTasks(connection, options);
  const transaction = await connection.getConnection();
  try {
    await transaction.beginTransaction();
    const handled = await scheduleRehifzTasks(transaction, options);
    await transaction.commit();
    return handled;
  } catch (error) { await transaction.rollback(); throw error; } finally { transaction.release(); }
}

async function scheduleRehifzTasks(connection, { plan, date, canCreate, buildRange, insertTask }) {
  // Generation through a pool owns a transaction; teacher sessions already supply one.
  await connection.query('SELECT id FROM students WHERE id=? FOR UPDATE', [plan.studentId]);
  const [[revision]] = await connection.query(`SELECT id,ranges_json AS ranges,DATE_FORMAT(requested_date,'%Y-%m-%d') AS requestedDate
    FROM student_passing_rehifz WHERE student_id=? AND status='pending' ORDER BY id LIMIT 1`, [plan.studentId]);
  const [[day]] = await connection.query("SELECT id FROM student_quran_tasks WHERE plan_id=? AND task_date=? AND task_type='memorization' AND passing_rehifz_id IS NOT NULL LIMIT 1", [plan.id, date]);
  if (!revision || date < revision.requestedDate) return Boolean(day);
  if (!canCreate) return true;
  const [[existing]] = await connection.query("SELECT id FROM student_quran_tasks WHERE plan_id=? AND task_date=? AND task_type='memorization' LIMIT 1", [plan.id, date]);
  if (existing) return true;
  await connection.query('UPDATE student_passing_rehifz SET plan_id=? WHERE id=? AND plan_id<>?', [plan.id, revision.id, plan.id]);
  const range = await buildRemainingRehifzRange(connection, revision, plan, buildRange);
  if (!range) { await refreshPassingRehifz(connection, revision.id, date); return false; }
  const workingPlan = { ...plan, track: 'memorization', startPage: range.start.page, startSurah: range.start.surah, startAyah: range.start.ayah,
    endPage: range.end.page, endSurah: range.end.surah, endAyah: range.end.ayah };
  for (const type of ['memorization', 'repeat']) {
    await insertTask(connection, { plan: workingPlan, date, type, fromPage: range.start.page, toPage: range.end.page, targetPages: range.faces,
      bounds: { fromSurah: range.start.surah, fromAyah: range.start.ayah, toSurah: range.end.surah, toAyah: range.end.ayah }, passingRehifzId: revision.id });
  }
  return true;
}

async function buildRemainingRehifzRange(connection, revision, plan, buildRange) {
  const progress = await rehifzProgress(connection, revision);
  if (!progress.remaining.length) return null;
  const first = progress.remaining[0];
  const firstIndex = progress.ayahs.findIndex(ayah => key(ayah) === key(first));
  let endIndex = firstIndex;
  while (endIndex + 1 < progress.ayahs.length && progress.remaining.some(ayah => key(ayah) === key(progress.ayahs[endIndex + 1]))) endIndex++;
  const last = progress.ayahs[endIndex];
  const range = await buildRange(connection, first, last, Math.max(0.25, Number(plan.dailyPages) || 1));
  if (!range) throw fail('تعذر إعداد مقدار إعادة الحفظ.');
  return range;
}

export async function previewPassingRehifz(connection, { plan, date, buildRange }) {
  const [[revision]] = await connection.query(`SELECT id,ranges_json AS ranges,DATE_FORMAT(requested_date,'%Y-%m-%d') AS requestedDate
    FROM student_passing_rehifz WHERE student_id=? AND status='pending' ORDER BY id LIMIT 1`, [plan.studentId]);
  if (!revision || date < revision.requestedDate) return null;
  const range = await buildRemainingRehifzRange(connection, revision, plan, buildRange);
  return range ? { range, id: revision.id } : null;
}

export async function readStudentRehifz(connection, studentId) {
  const [rows] = await connection.query("SELECT id,juz_number AS juzNumber,status FROM student_passing_rehifz WHERE student_id=? AND status='pending' ORDER BY id", [studentId]);
  return rows;
}

export async function pendingRehifzWork(connection, studentId) {
  if (!studentId) return [];
  const [rows] = await connection.query("SELECT id,ranges_json AS ranges FROM student_passing_rehifz WHERE student_id=? AND status='pending' ORDER BY id", [studentId]);
  return Promise.all(rows.map(async row => ({ ranges: parse(row.ranges), accepted: (await rehifzProgress(connection, row)).accepted })));
}
