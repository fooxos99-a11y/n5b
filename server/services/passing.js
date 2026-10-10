import { PASSING_POLICY_KEY, PASSING_TYPES, parsePassingPolicy, passingPolicyErrors, effectivePassingPolicy, evaluatePassingPart, passingExamStatus } from '../../shared/passing-policy.js';
import { isMistakeMark } from '../../shared/recitation-mark-types.js';
import { loadEligiblePassingParts } from './passingEligibility.js';
import { assertSupervisorStudentScope } from './supervisorStudentScope.js';
import { assertWholePassingPart } from './passingRehifz.js';
import { readQuranRange } from './quranReferenceCache.js';

export { buildPassingParts } from './passingEligibility.js';

const fail = (message, status = 422) => Object.assign(new Error(message), { status, statusCode: status });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
export async function loadPassingPolicy(connection) {
  const [[row]] = await connection.query('SELECT setting_value AS policy FROM app_settings WHERE setting_key = ?', [PASSING_POLICY_KEY]);
  return parsePassingPolicy(row?.policy);
}
export async function savePassingPolicy(connection, policy) {
  const errors = passingPolicyErrors(policy);
  if (Object.keys(errors).length) throw fail(Object.values(errors)[0]);
  const clean = parsePassingPolicy(policy);
  // Store only the owned numeric policy fields; never persist arbitrary request properties.
  for (const type of Object.keys(PASSING_TYPES)) {
    clean[type] = { ...effectivePassingPolicy(clean, type, 0), juzOverrides: Object.fromEntries(Object.keys(clean[type].juzOverrides).map(juz => [juz, effectivePassingPolicy(clean, type, juz)])) };
  }
  await connection.query('INSERT INTO app_settings(setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [PASSING_POLICY_KEY, JSON.stringify(clean)]);
  return clean;
}
export async function createPassingExam(pool, { studentId, type, juz, actor, loadMemorizedRanges, loadAyahs }) {
  if (!Object.hasOwn(PASSING_TYPES, type) || (type === 'branch' && (!Number.isInteger(juz) || juz < 1 || juz > 30))) throw fail('حدد نوع الاجتياز والجزء بصورة صحيحة.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[student]] = await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    if (!student) throw fail('الطالب غير موجود.', 404);
    await assertSupervisorStudentScope(connection, actor, { studentId });
    const [open] = await connection.query(`SELECT e.id FROM student_passing_exams e
      JOIN student_passing_parts p ON p.exam_id = e.id
      LEFT JOIN student_passing_attempts a ON a.id = (SELECT MAX(latest.id) FROM student_passing_attempts latest WHERE latest.part_id = p.id)
      WHERE e.student_id = ? AND e.exam_type = ? ${type === 'branch' ? 'AND p.juz_number = ?' : ''}
      AND (a.id IS NULL OR JSON_EXTRACT(a.result_json, '$.passed') = false) LIMIT 1`, [studentId, type, ...(type === 'branch' ? [juz] : [])]);
    if (open.length) throw fail('يوجد اجتياز غير مكتمل. أكمله أو أعد الأجزاء المطلوبة.', 409);
    const parts = await loadEligiblePassingParts(connection, { studentId, type, juz, loadMemorizedRanges, loadAyahs });
    if (!parts.length) throw fail('لا يوجد جزء محفوظ كامل ومعتمد لهذا الطالب.');
    const [result] = await connection.query('INSERT INTO student_passing_exams(student_id, exam_type, created_by_role, created_by_id) VALUES (?, ?, ?, ?)', [studentId, type, actor.role, actor.id]);
    for (const part of parts) await connection.query('INSERT INTO student_passing_parts(exam_id, juz_number, ranges_json) VALUES (?, ?, ?)', [result.insertId, part.juzNumber, JSON.stringify(part.ranges)]);
    await connection.commit();
    return Number(result.insertId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
export async function loadPassingExam(connection, examId) {
  const [[exam]] = await connection.query(`SELECT e.id, e.student_id AS studentId, e.exam_type AS type, s.name AS studentName,
    c.name AS committeeName, DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
    FROM student_passing_exams e JOIN students s ON s.id = e.student_id LEFT JOIN committees c ON c.id = s.committee_id WHERE e.id = ?`, [examId]);
  if (!exam) throw fail('الاجتياز غير موجود.', 404);
  const [parts] = await connection.query('SELECT id, juz_number AS juzNumber, ranges_json AS ranges FROM student_passing_parts WHERE exam_id = ? ORDER BY juz_number', [examId]);
  const [attempts] = await connection.query(`SELECT a.id, a.part_id AS partId, a.evaluation_mode AS mode, a.result_json AS result,
    a.policy_json AS policy, a.marks_json AS marks, a.actor_name AS actorName, a.rehifz_decision AS rehifzDecision,
    a.rehifz_id AS rehifzId, r.status AS rehifzStatus, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
    FROM student_passing_attempts a JOIN student_passing_parts p ON p.id = a.part_id
    LEFT JOIN student_passing_rehifz r ON r.id=a.rehifz_id WHERE p.exam_id = ? ORDER BY a.id DESC`, [examId]);
  exam.parts = parts.map(part => {
    const history = attempts.filter(attempt => Number(attempt.partId) === Number(part.id)).map(attempt => ({ ...attempt, result: parse(attempt.result), policy: parse(attempt.policy), marks: parse(attempt.marks) }));
    return { ...part, ranges: parse(part.ranges), attempts: history, latestAttempt: history[0] || null };
  });
  return { ...exam, status: passingExamStatus(exam.parts) };
}
export async function recordPassingAttempt(pool, { partId, body, actor, normalizeMarks }) {
  if (!['count', 'mushaf'].includes(body.mode) || typeof body.requestId !== 'string' || !/^[\w:-]{8,100}$/.test(body.requestId)
    || !Number.isSafeInteger(body.previousAttemptId) || body.previousAttemptId < 0) throw fail('بيانات المحاولة غير صحيحة.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[part]] = await connection.query(`SELECT p.id, p.juz_number AS juzNumber, p.ranges_json AS ranges, e.exam_type AS type, s.id AS studentId
      FROM student_passing_parts p JOIN student_passing_exams e ON e.id = p.exam_id JOIN students s ON s.id = e.student_id WHERE p.id = ? FOR UPDATE`, [partId]);
    if (!part) throw fail('الجزء غير موجود.', 404);
    await assertSupervisorStudentScope(connection, actor, { studentId: part.studentId });
    const [[duplicate]] = await connection.query('SELECT id, result_json AS result FROM student_passing_attempts WHERE part_id = ? AND request_id = ?', [partId, body.requestId]);
    if (duplicate) { await connection.commit(); return { ...parse(duplicate.result), attemptId: duplicate.id }; }
    if (part.type === 'branch' && !(await loadEligiblePassingParts(connection, { studentId: part.studentId, type: part.type,
      juz: Number(part.juzNumber), loadAyahs: conn => readQuranRange(conn, 1, 604) })).length) {
      throw fail('هذا الجزء غير محفوظ كاملًا ومعتمدًا ضمن خطة الطالب الحالية.');
    }
    await assertWholePassingPart(connection, part);
    const [[latest]] = await connection.query('SELECT id, result_json AS result, rehifz_decision AS decision FROM student_passing_attempts WHERE part_id = ? ORDER BY id DESC LIMIT 1', [partId]);
    if (Number(latest?.id || 0) !== body.previousAttemptId) throw fail('تغيّرت نتيجة الجزء. حدّث الاجتياز قبل إعادة التسميع.', 409);
    if (latest && parse(latest.result).passed) throw fail('هذا الجزء مجتاز بالفعل.', 409);
    if (latest?.decision === 'pending') throw fail('حدد قرار إعادة الحفظ للمحاولة السابقة أولًا.', 409);
    let counts = { mistakeCount: body.mistakeCount, warningCount: body.warningCount, hesitationCount: body.hesitationCount };
    const marks = [];
    if (body.mode === 'mushaf') {
      const ranges = parse(part.ranges);
      if (!Array.isArray(body.segments) || body.segments.length !== ranges.length
        || body.segments.some(item => !item || !Number.isInteger(item.index) || item.index < 0 || item.index >= ranges.length)
        || new Set(body.segments.map(item => item.index)).size !== ranges.length) throw fail('يجب إكمال جميع مقاطع الجزء.');
      for (let index = 0; index < ranges.length; index++) {
        const segment = body.segments.find(item => item.index === index);
        if (!segment || !Array.isArray(segment.wordMarks) || segment.wordMarks.length > 1000) throw fail('علامات التسميع غير صحيحة.');
        const normalized = await normalizeMarks(connection, ranges[index], segment.wordMarks);
        if (!normalized) throw fail('إحدى العلامات خارج نطاق الجزء.');
        marks.push(...normalized.map(mark => ({ ...mark, segmentIndex: index })));
      }
      counts = { mistakeCount: marks.filter(mark => isMistakeMark(mark.markType)).length,
        warningCount: marks.filter(mark => mark.markType === 'warning').length, hesitationCount: marks.filter(mark => mark.markType === 'hesitation').length };
    }
    if (Object.values(counts).some(value => !Number.isInteger(value) || value < 0 || value > 1000)) throw fail('الأعداد يجب أن تكون أعدادًا صحيحة من 0 إلى 1000.');
    const policy = effectivePassingPolicy(await loadPassingPolicy(connection), part.type, part.juzNumber);
    const result = evaluatePassingPart(policy, counts);
    const [saved] = await connection.query(`INSERT INTO student_passing_attempts(part_id, request_id, evaluation_mode, result_json, policy_json, marks_json, actor_role, actor_id, actor_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [partId, body.requestId, body.mode, JSON.stringify(result), JSON.stringify(policy), JSON.stringify(marks), actor.role, actor.id, String(actor.name || '').slice(0, 160)]);
    await connection.commit();
    return { ...result, attemptId: saved.insertId };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
