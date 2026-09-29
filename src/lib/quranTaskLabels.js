const quranTaskTypeLabels = {
  memorization: 'حفظ',
  mastery: 'إتقان',
  review: 'مراجعة',
  link: 'ربط',
  repeat: 'تكرار',
};

export const getQuranTaskLabel = (task = {}) => {
  if (task.taskType === 'memorization') {
    if (task.track === 'mastery' || task.trackLabel === 'إتقان') return 'إتقان';
    return task.trackLabel || 'حفظ';
  }
  return quranTaskTypeLabels[task.taskType] || task.taskType || '-';
};
