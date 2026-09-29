// Plans expose these normalized, completed quantities.
export function studentPlanLevel(plan) {
  if (!plan) return 0;
  for (const [totalKey, completedKey] of [['totalAyahs', 'completedAyahs'], ['totalPages', 'completedPages']]) {
    const total = Number(plan[totalKey]);
    const completed = Number(plan[completedKey]);
    if (total > 0 && Number.isFinite(total) && plan[completedKey] != null && Number.isFinite(completed)) {
      return Math.max(0, Math.min(100, Math.floor(completed / total * 100)));
    }
  }
  // Older offline snapshots contain only a rounded percentage: they cannot prove completion.
  const percent = Number(plan.progressPercent ?? plan.progress?.progressPercent ?? 0);
  if (Number.isFinite(percent)) {
    return Math.max(0, Math.min(plan.status === 'completed' ? 100 : 99, Math.floor(percent)));
  }
  return 0;
}
