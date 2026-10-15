import type { StudentWeek } from '../../domain/studentDashboard';

/** Match the source session view without exposing excluded record-only dates. */
export function studentSessionDays(week: StudentWeek, today: string): StudentWeek['days'] {
  return week.days.filter(day => {
    if (day.date > today) return false;
    const scheduled = week.grade?.scheduledRecords[day.date];
    return day.date === today || day.tasks.length > 0 || !!day.points
      || !!((scheduled?.attendance || scheduled?.reading) && Object.keys(week.grade?.records[day.date] ?? {}).length);
  });
}
