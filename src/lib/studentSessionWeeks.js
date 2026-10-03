import { buildStudentPlanWeeks } from './studentPlan.js';

/** Merge the grade history so reading-only and session-only weeks remain visible. */
export function buildStudentSessionWeeks({ weeklyGrades = [], ...plan } = {}) {
  const weeks = new Map(buildStudentPlanWeeks(plan)
    .filter(week => week.start <= plan.today).map(week => [week.start, week]));
  for (const grade of weeklyGrades) {
    if (grade.weekStart > plan.today) continue;
    const week = weeks.get(grade.weekStart) || { start: grade.weekStart, end: grade.weekEnd, days: [] };
    week.grade = grade;
    const days = new Map(week.days.filter(day => day.date <= plan.today).map(day => [day.date, day]));
    for (const summary of grade.days || []) {
      if (summary.date > plan.today || summary.excluded || !Object.keys(summary.components).length) continue;
      const records = grade.records?.[summary.date] || {};
      if (!days.has(summary.date) && !Object.keys(records).length) continue;
      const day = days.get(summary.date) || { date: summary.date, tasks: [] };
      day.grading = summary.components;
      day.records = records;
      days.set(summary.date, day);
    }
    week.days = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
    weeks.set(week.start, week);
  }
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start));
}
