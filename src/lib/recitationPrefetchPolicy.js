export function recitationTaskCacheVersion(task) {
  return JSON.stringify([task.planVersion, task.taskDate, task.taskType, task.track,
    task.fromPage, task.toPage, task.fromSurah, task.fromAyah, task.toSurah, task.toAyah,
    task.teacherCompleted, task.evaluatedAt]);
}

export function selectRecitationPrefetchTasks(tasks, { automatic = false, date = '' } = {}) {
  const unique = [...new Map(tasks.filter((task) => Number(task.id) > 0
    && ['memorization', 'review', 'link'].includes(task.taskType))
    .map((task) => [Number(task.id), task])).values()];
  if (!automatic) return unique;
  return unique.filter((task) => !task.teacherCompleted && (!date || task.taskDate === date)).slice(0, 24);
}

export const supportsIndividualSyncFallback = (error) => [404, 405, 501].includes(Number(error?.status));
