import { buildPlanMushafTarget, planCompactAmount } from './studentPlan.js';

export const HOME_TASK_TYPES = ['memorization', 'review', 'link'];
export function studentHomePlan(today, date, executionEnabled = true) {
  if (!today || today.date !== date) return { groups: [], percent: 0 };
  const tasks = (today.todayAmounts || today.tasks || []).filter((task) => HOME_TASK_TYPES.includes(task.taskType));
  const done = (task) => (executionEnabled && task.studentStatus === 'done') || task.teacherCompleted === true || task.teacherCompleted === 1;
  const labels = { memorization: today.plan?.track === 'mastery' ? 'الإتقان' : 'الحفظ', review: 'المراجعة', link: 'الربط' };
  const activeTypes = HOME_TASK_TYPES.filter(type => tasks.some(task => task.taskType === type));
  const completedTypes = activeTypes.filter(type => tasks.filter(task => task.taskType === type).every(done));
  return {
    seasonalHoliday: Boolean(today.isSeasonalHoliday),
    planPaused: Boolean(today.isPlanPaused),
    percent: activeTypes.length ? Math.floor(completedTypes.length / activeTypes.length * 100) : 0,
    groups: HOME_TASK_TYPES.flatMap((type) => {
      const rows = tasks.filter((task) => task.taskType === type);
      return rows.length ? [{ type, label: labels[type], complete: rows.every(done),
        studentExecutable: (today.tasks || []).some((task) => task.taskType === type),
        amount: rows.map(planCompactAmount).filter(Boolean).join('، '), target: buildPlanMushafTarget(rows, labels[type]) }] : [];
    }),
  };
}

export function studentHomeFeatures(settings, siteFeatures = {}) {
  return {
    store: siteFeatures.store !== false && Boolean(settings?.storeEnabled),
    sessions: true,
    mushaf: true,
    calls: true,
  };
}
