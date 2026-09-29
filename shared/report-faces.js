export function sumReportFaces(items = []) {
  if (!items.length) return null;
  const amounts = items.map((item) => item.actualFaces);
  if (amounts.some((amount) => amount == null || !Number.isFinite(Number(amount)))) return null;
  return Math.round(amounts.reduce((sum, amount) => sum + Math.max(0, Number(amount)), 0) * 10000) / 10000;
}

export function formatReportFaces(value) {
  if (value == null) return 'لا توجد بيانات';
  if (value === 0) return 'لم يُنجز';
  if (value === 0.25) return 'ربع وجه';
  if (value === 0.5) return 'نصف وجه';
  if (value === 1) return 'وجه';
  if (value === 2) return 'وجهان';
  const unit = value >= 3 && value <= 10 ? 'أوجه' : 'وجه';
  return `${value.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 4 })} ${unit}`;
}

function completedTask(item, taskType) {
  if (taskType === 'memorization') {
    return item.teacherCompleted === true || (
      item.teacherCompleted === null
      && item.studentStatus === 'done'
      && ['complete', 'partial', 'extra'].includes(item.executionState)
    );
  }
  if (taskType === 'review') return item.studentStatus === 'done';
  return item.studentStatus === 'done' && item.teacherCompleted !== false && item.executionState !== 'partial';
}

export const getTaskSummary = (row, taskType, isDaily, period, track = null) => {
  const details = row.tasks?.[taskType]?.details || [];
  const selectedDetails = isDaily
    ? details.filter((detail) => detail.date === period?.from)
    : details;
  const candidates = selectedDetails
    .flatMap((detail) => detail.items || [])
    .filter((item) => !track || (item.track || 'memorization') === track);
  const items = candidates.filter((item) => completedTask(item, taskType));
  if (!candidates.length) return { hasItems: false, faces: null };
  return {
    hasItems: true,
    faces: items.length ? sumReportFaces(items) : 0,
  };
};
