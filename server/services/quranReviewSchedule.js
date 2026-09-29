import { parseReviewExecution } from '../../shared/quran-review-cycle.js';
// Review rotates through the available memorized pages, independently of the new plan's bounds.
export function reviewStartFromHistory(rows, fallbackPage) {
  let cursor = Number(fallbackPage || 1);
  const days = new Map();
  for (const row of rows) {
    const date = String(row.taskDate || '');
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(row);
  }
  let initialized = false;
  for (const [, day] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const touched = day.some((row) => row.teacherCompleted != null || row.executedAt || row.studentStatus === 'done');
    // Generated future/pending rows are not evidence of progress.
    if (initialized && !touched) continue;
    initialized = true;
    cursor = reviewCursorAfterDay(day, cursor);
  }
  return cursor;
}

function reviewCursorAfterDay(day, cursor) {
  const cycleRow = day.find(row => parseReviewExecution(row.reviewExecution));
  const cycle = parseReviewExecution(cycleRow?.reviewExecution);
  if (cycle) return Number(cycleRow.teacherCompleted != null && Number(cycleRow.teacherCompleted) !== 1
    ? cycle.ranges[0].start.page : cycle.next.page);
  const ascending = [...day].sort((a, b) => Number(a.fromPage) - Number(b.fromPage));
  let start = ascending.findIndex((row) => Number(row.toPage) >= cursor);
  if (start < 0) start = 0;
  const ordered = [...ascending.slice(start), ...ascending.slice(0, start)];
  const incomplete = ordered.find((row) => row.executionState === 'partial'
    || (Number(row.teacherCompleted) !== 1
      && (row.teacherCompleted != null || row.studentStatus !== 'done')));
  if (incomplete) {
    const acceptedPartial = incomplete.executionState === 'partial'
      && (incomplete.teacherCompleted == null || Number(incomplete.teacherCompleted) === 1);
    cursor = Number(acceptedPartial
      ? incomplete.actualToPage || incomplete.fromPage : incomplete.fromPage);
    if (acceptedPartial && incomplete.actualCompletesPage) cursor += 1;
  } else {
    const last = ordered.at(-1);
    cursor = Number(last.toPage) + 1;
  }
  return cursor;
}

export async function getReviewStartForDate(connection, plan, date) {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
      from_page AS fromPage, to_page AS toPage, actual_to_page AS actualToPage,
      actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah,
      teacher_completed AS teacherCompleted, student_status AS studentStatus,
      review_execution_json AS reviewExecution, execution_state AS executionState, executed_at AS executedAt
     FROM student_quran_tasks
     WHERE plan_id = ? AND task_type = 'review' AND task_date < ?
     ORDER BY task_date, from_page, id`,
    [plan.id, date],
  );
  const boundaries = new Map();
  for (const row of rows) {
    if (row.executionState !== 'partial' || !row.actualToPage
      || (row.teacherCompleted != null && Number(row.teacherCompleted) !== 1)) continue;
    if (!boundaries.has(Number(row.actualToPage))) {
      const [[boundary]] = await connection.query(
        `SELECT surah_number AS surah, ayah_number AS ayah FROM quran_ayah_pages
         WHERE page_number = ? ORDER BY surah_number DESC, ayah_number DESC LIMIT 1`, [row.actualToPage],
      );
      boundaries.set(Number(row.actualToPage), boundary);
    }
    const boundary = boundaries.get(Number(row.actualToPage));
    row.actualCompletesPage = Boolean(boundary && Number(row.actualToSurah) === Number(boundary.surah)
      && Number(row.actualToAyah) === Number(boundary.ayah));
  }
  return reviewStartFromHistory(rows, plan.startPage);
}

export function reviewPagesMatch(rows, desiredPages) {
  const current = new Set(rows.flatMap((row) => Array.from(
    { length: Number(row.toPage) - Number(row.fromPage) + 1 }, (_, index) => Number(row.fromPage) + index,
  )));
  const desired = new Set(desiredPages);
  return current.size === desired.size && [...current].every((page) => desired.has(page));
}
