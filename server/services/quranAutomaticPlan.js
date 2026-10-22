import { AUTOMATIC_PLAN_KEY, defaultAutomaticTemplate, generateAutomaticRanges, resolveAutomaticRange, validateAutomaticTemplate } from '../../shared/quran-automatic-plan.js';
import { readQuranRange } from './quranReferenceCache.js';

export async function loadAutomaticMemorizedRanges(connection, studentId) {
  const [rows] = await connection.query(`
    SELECT start_surah AS startSurah, start_ayah AS startAyah, start_page AS startPage,
      end_surah AS endSurah, end_ayah AS endAyah, end_page AS endPage
    FROM student_quran_plan_prior_memorization WHERE student_id = ?
    UNION ALL SELECT start_surah, start_ayah, start_page, end_surah, end_ayah, end_page
    FROM student_quran_prior_memorization WHERE student_id = ?
    UNION ALL SELECT from_surah, from_ayah, from_page, COALESCE(actual_to_surah, to_surah),
      COALESCE(actual_to_ayah, to_ayah), COALESCE(actual_to_page, to_page)
    FROM student_quran_tasks WHERE student_id = ? AND task_type = 'memorization' AND teacher_completed = 1
      AND from_surah IS NOT NULL AND from_ayah IS NOT NULL AND to_surah IS NOT NULL AND to_ayah IS NOT NULL`,
  [studentId, studentId, studentId]);
  return rows;
}

export async function loadAutomaticTemplate(connection) {
  const ayahs = await readQuranRange(connection, 1, 604);
  const defaultTemplate = defaultAutomaticTemplate(ayahs);
  const [[row]] = await connection.query('SELECT setting_value AS template FROM app_settings WHERE setting_key = ?', [AUTOMATIC_PLAN_KEY]);
  const stored = row ? JSON.parse(row.template) : null;
  const template = stored ? { ...validateAutomaticTemplate(ayahs, stored), revision: Number(stored.revision) } : defaultTemplate;
  return { template, defaultTemplate };
}

export async function saveAutomaticTemplate(pool, input) {
  const connection = await pool.getConnection();
  try {
    const ayahs = await readQuranRange(connection, 1, 604);
    const validated = validateAutomaticTemplate(ayahs, input);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw Object.assign(new Error('أعد تحميل القالب قبل حفظه.'), { status: 422 });
    await connection.beginTransaction();
    await connection.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)',
      [AUTOMATIC_PLAN_KEY, JSON.stringify(defaultAutomaticTemplate(ayahs))]);
    const [[row]] = await connection.query('SELECT setting_value AS template FROM app_settings WHERE setting_key = ? FOR UPDATE', [AUTOMATIC_PLAN_KEY]);
    if (Number(JSON.parse(row.template).revision) !== input.revision) throw Object.assign(new Error('تغيّر القالب. أعد تحميله ثم حاول مجددًا.'), { status: 409 });
    const template = { ...validated, revision: input.revision + 1 };
    await connection.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [JSON.stringify(template), AUTOMATIC_PLAN_KEY]);
    await connection.commit();
    return template;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function prepareAutomaticRanges(connection, { ranges, studentId, priorMemorization = [], current = null }) {
  if (Array.isArray(ranges) && ranges.length === 0) return { ranges: [], stages: [], excludedAyahs: 0 };
  const ayahs = await readQuranRange(connection, 1, 604);
  const validated = validateAutomaticTemplate(ayahs, { name: 'خطط الطالب', ranges });
  return generateAutomaticRanges(ayahs, validated.ranges,
    [...await loadAutomaticMemorizedRanges(connection, studentId), ...priorMemorization], current ? [current] : []);
}

export async function saveAutomaticPriorOnly(pool, { studentId, ranges }) {
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 100) throw Object.assign(new Error('أضف محفوظًا مجتازًا قبل حفظه.'), { status: 422 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[student]] = await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    if (!student) throw Object.assign(new Error('الطالب غير موجود.'), { status: 404 });
    const ayahs = await readQuranRange(connection, 1, 604);
    const canonical = ranges.map(range => resolveAutomaticRange(ayahs, range));
    if (canonical.some(range => range.startSurah > range.endSurah)) throw Object.assign(new Error('أدخل المحفوظ المجتاز بترتيب المصحف.'), { status: 422 });
    const added = generateAutomaticRanges(ayahs, canonical, await loadAutomaticMemorizedRanges(connection, studentId)).ranges;
    for (const range of added) await connection.query(`INSERT INTO student_quran_prior_memorization
      (student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [studentId, range.startSurah, range.startAyah, range.startPage, range.endSurah, range.endAyah, range.endPage]);
    await connection.commit();
    return { ok: true, addedRanges: added.length };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
