const evaluationCount = (value) => Math.max(0, Number(value || 0));

export const hasRecitationIssues = (row = {}) => (
  evaluationCount(row.mistakeCount) > 0 || evaluationCount(row.warningCount) > 0 || evaluationCount(row.hesitationCount) > 0
);

export const isMasteredRecitation = (row = {}) => (
  (row.teacherCompleted === true || row.teacherCompleted === 1) && !hasRecitationIssues(row)
);

export const getRecitationStatusLabel = (row = {}) => {
  if (isMasteredRecitation(row)) return 'متقن';
  if (row.teacherCompleted === true || row.teacherCompleted === 1) return '';
  if (row.teacherRatingKey === 'repeat_required') return 'يحتاج إعادة';
  if (row.teacherCompleted === false || row.teacherCompleted === 0) return 'يحتاج إعادة';
  return 'لم يقيّم';
};
