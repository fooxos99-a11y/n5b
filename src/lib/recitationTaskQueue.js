export const recitationSequenceKey = (task) => [
  Number(task?.studentId || 0),
  Number(task?.planId || 0),
  task?.taskType,
  task?.track || 'memorization',
].join(':');

export const canAdvanceRecitationSession = (session) => Boolean(session?.tasks?.length
  && session.status !== 'invalid_sequence'
  && session.tasks.every(({ payload, result }) => (session.status === 'synced' || session.tasks.some((item) => item.synced))
    ? result?.ok === true && result?.teacherCompleted === true
    : !payload?.notMemorized && payload?.offlineOutcome?.completed === true));

const compareQueuedTasks = (first, second) => (
  String(first?.taskDate || '').localeCompare(String(second?.taskDate || ''))
  || Number(first?.fromPage || 0) - Number(second?.fromPage || 0)
  || Number(first?.id || 0) - Number(second?.id || 0)
);

export function advanceRecitationTaskQueue(evaluation, completedTasks = [], { promote = true } = {}) {
  if (!evaluation || !completedTasks.length) return evaluation;
  const completedIds = new Set(completedTasks.map((task) => Number(task.id)));
  const tasks = (evaluation.tasks || []).filter((task) => !completedIds.has(Number(task.id)));
  const sourceQueue = evaluation.taskQueue || evaluation.tasks || [];
  const taskQueue = promote
    ? sourceQueue.filter((task) => !completedIds.has(Number(task.id)))
    : sourceQueue.map((task) => completedIds.has(Number(task.id)) ? { ...task, locallySaved: true } : task);

  return {
    ...evaluation,
    tasks: tasks.sort(compareQueuedTasks),
    taskQueue,
  };
}
