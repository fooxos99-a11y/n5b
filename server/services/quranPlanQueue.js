import { planRangesOverlap, readQueuedPlanRanges } from '../../shared/quran-plan-queue.js';

export async function validateQueuedPlanRanges(input, current, { resolve, expand }) {
  if (!Array.isArray(input) || input.length > 100) throw Object.assign(new Error('قائمة الخطط التالية غير صحيحة.'), { statusCode: 422 });
  const occupied = await expand(current);
  const ranges = [];
  for (const raw of input) {
    const range = await resolve(raw);
    if (!range) throw Object.assign(new Error('اختر بداية ونهاية صحيحتين لكل خطة تالية.'), { statusCode: 422 });
    const segments = await expand(range);
    if (segments.some(segment => occupied.some(other => planRangesOverlap(segment, other)))) {
      throw Object.assign(new Error('نطاق الخطة التالية يتداخل مع إحدى الخطط السابقة.'), { statusCode: 422 });
    }
    occupied.push(...segments);
    ranges.push(range);
  }
  return ranges;
}

/** Called inside the plan/execution transaction; the unique parent also prevents duplicate successors. */
export async function activateQueuedQuranPlan(connection, { planId, startDate, manual = false }) {
  const [[plan]] = await connection.query('SELECT * FROM student_quran_plans WHERE id = ? FOR UPDATE', [planId]);
  if (!plan || (!manual && plan.status !== 'completed') || !['active', 'completed'].includes(plan.status)) return null;
  const [[latest]] = await connection.query('SELECT MAX(id) AS id FROM student_quran_plans WHERE student_id = ?', [plan.student_id]);
  if (Number(latest.id) !== Number(plan.id)) return null;
  const [range, ...remaining] = readQueuedPlanRanges(plan.queued_ranges_json);
  if (!range) return null;
  const columns = ['student_id', 'previous_plan_id', 'queue_parent_id', 'status', 'plan_version', 'start_date', 'effective_from',
    'schedule_days_json', 'track', 'start_surah', 'start_ayah', 'start_page', 'end_surah', 'end_ayah', 'end_page',
    'daily_pages', 'link_pages', 'review_pages', 'review_hizbs', 'reading_faces', 'reading_hizbs', 'review_split_weekly',
    'review_week_start_day', 'review_week_end_day', 'review_min_daily_pages',
    'next_memorization_page', 'next_memorization_surah', 'next_memorization_ayah', 'next_review_page', 'queued_ranges_json'];
  const overrides = { previous_plan_id: plan.id, queue_parent_id: plan.id, status: 'active', plan_version: Number(plan.plan_version) + 1,
    start_date: startDate, effective_from: startDate, schedule_days_json: typeof plan.schedule_days_json === 'string' ? plan.schedule_days_json : JSON.stringify(plan.schedule_days_json),
    start_surah: range.startSurah, start_ayah: range.startAyah, start_page: range.startPage,
    end_surah: range.endSurah, end_ayah: range.endAyah, end_page: range.endPage,
    next_memorization_page: range.startPage, next_memorization_surah: range.startSurah,
    next_memorization_ayah: range.startAyah, next_review_page: range.startPage, queued_ranges_json: JSON.stringify(remaining) };
  const [result] = await connection.query(`INSERT INTO student_quran_plans (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
  columns.map(column => Object.hasOwn(overrides, column) ? overrides[column] : plan[column]));
  await connection.query('UPDATE student_quran_plans SET queued_ranges_json = NULL, status = ? WHERE id = ?', [manual ? 'paused' : 'completed', plan.id]);
  return Number(result.insertId);
}
