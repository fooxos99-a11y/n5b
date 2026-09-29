export const latestDailyTaskAttempts = (attempts = []) => {
  const ordered = [...attempts].sort((first, second) => (
    String(second.evaluatedAt || '').localeCompare(String(first.evaluatedAt || ''))
    || Number(second.attemptNumber || 0) - Number(first.attemptNumber || 0)
  ));
  const latest = new Map();
  ordered.forEach((row) => {
    const key = `${row.studentId}:${row.sessionDate}:${row.taskId || row.id}`;
    if (!latest.has(key)) latest.set(key, row);
  });
  return [...latest.values()];
};
