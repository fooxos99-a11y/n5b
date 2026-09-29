/** Update the same plan row; accepted work, attempts and overdue tasks keep their identities. */
export async function updateContinuedQuranPlan(connection, { plan, values, effectiveFrom, scheduleDays, scheduleAnchor }) {
  await connection.query(`UPDATE student_quran_plans SET
    plan_version = plan_version + 1, start_date = ?, effective_from = ?, schedule_days_json = ?,
    schedule_anchor_page = ?, schedule_anchor_surah = ?, schedule_anchor_ayah = ?,
    track = ?, start_surah = ?, start_ayah = ?, start_page = ?, end_surah = ?, end_ayah = ?, end_page = ?,
    daily_pages = ?, link_pages = ?, review_pages = ?, review_hizbs = ?, reading_faces = ?,
    review_split_weekly = ?, review_week_start_day = ?, review_week_end_day = ?, review_min_daily_pages = ?
    WHERE id = ? AND student_id = ? AND status IN ('active', 'completed')`,
  [values.startDate, effectiveFrom, JSON.stringify(scheduleDays), scheduleAnchor?.page ?? null,
    scheduleAnchor?.surah ?? null, scheduleAnchor?.ayah ?? null, values.track,
    values.start.surah, values.start.ayah, values.start.page, values.end.surah, values.end.ayah, values.end.page,
    values.dailyPages, values.linkPages, values.reviewPages, values.reviewHizbs, values.readingFaces,
    values.reviewSplitWeekly, values.reviewWeekStartDay, values.reviewWeekEndDay, values.reviewMinDailyPages,
    plan.id, plan.studentId]);
  await connection.query(`DELETE t FROM student_quran_tasks t
    WHERE t.plan_id = ? AND t.task_date >= ? AND t.teacher_completed IS NULL
      AND COALESCE(t.student_status, 'not_done') <> 'done'
      AND NOT EXISTS (SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id AND a.is_official = 1)`,
  [plan.id, effectiveFrom]);
}
