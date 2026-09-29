const visibleTaskFields = new Set([
  'id', 'planId', 'studentId', 'studentName', 'committeeName', 'taskDate', 'taskType',
  'track', 'trackLabel', 'studentStatus', 'teacherRatingKey', 'teacherRatingLabel',
  'warningCount', 'mistakeCount', 'evaluationScore', 'evaluationMaxScore', 'points',
  'actualRepeatCount', 'actualListeningCount', 'repeatCount', 'listeningCount',
  'executionActorRole', 'repeatExecutionActorRole',
  'attemptCount', 'teacherCompleted', 'executionState', 'sessionDate', 'teacherName', 'evaluatedAt',
]);

export const shouldHideStudentAmounts = (settings, role) => role === 'student'
  && (settings?.hideStudentAmounts === true || settings?.hideStudentAmounts === 'true');

export function hideStudentTaskAmount(task) {
  return { ...Object.fromEntries(Object.entries(task).filter(([key]) => visibleTaskFields.has(key))), amountHidden: true };
}

export const studentAmountKeys = Object.freeze({
  memorization: 'hideStudentMemorizationAmount', review: 'hideStudentReviewAmount', link: 'hideStudentLinkAmount',
});

export function isStudentAmountHidden(settings, type) {
  if (!shouldHideStudentAmounts(settings, 'student')) return false;
  const key = studentAmountKeys[type === 'repeat' || type === 'mastery' ? 'memorization' : type];
  return Boolean(key) && settings?.[key] !== false && settings?.[key] !== 'false';
}

export function studentVisibleTasks(tasks, settings, role) {
  return shouldHideStudentAmounts(settings, role)
    ? tasks.map(task => isStudentAmountHidden(settings, task.taskType) ? hideStudentTaskAmount(task) : task) : tasks;
}

export function studentVisibleToday(data, settings, role) {
  if (!shouldHideStudentAmounts(settings, role)) return data;
  const { executionAyahsByType, ...visibleData } = data;
  const hiddenMemorization = isStudentAmountHidden(settings, 'memorization');
  const visibility = Object.fromEntries(Object.entries(studentAmountKeys).map(([type, key]) => [key, isStudentAmountHidden(settings, type)]));
  const _resolveExecutionAyahs = () => {
    if (executionAyahsByType) {
      return Object.entries(executionAyahsByType).filter(([type]) => !isStudentAmountHidden(settings, type)).flatMap(([, ayahs]) => ayahs);
    }
    if (Object.values(visibility).some(Boolean)) {
      return [];
    }
    return data.executionAyahs;
  };
  return {
    ...visibleData,
    ...visibility,
    hideStudentAmounts: true,
    reviewCycle: visibility.hideStudentReviewAmount ? null : data.reviewCycle,
    plan: hiddenMemorization && data.plan ? { id: data.plan.id, track: data.plan.track,
      progressPercent: data.plan.progressPercent ?? data.plan.progress?.progressPercent ?? 0 } : data.plan ?? null,
    tasks: studentVisibleTasks(data.tasks || [], settings, role),
    todayAmounts: studentVisibleTasks(data.todayAmounts || [], settings, role),
    nextDay: data.nextDay ? { date: data.nextDay.date, tasks: studentVisibleTasks(data.nextDay.tasks || [], settings, role) } : null,
    executionAyahs: _resolveExecutionAyahs(),
    executionAyahsByType: executionAyahsByType ? Object.fromEntries(Object.entries(executionAyahsByType).filter(([type]) => !isStudentAmountHidden(settings, type))) : undefined,
    executionLimits: Object.fromEntries(Object.entries(data.executionLimits || {}).filter(([type]) => !isStudentAmountHidden(settings, type))),
    studentTaskAmountEditable: hiddenMemorization ? false : data.studentTaskAmountEditable,
    studentReviewAmountEditable: visibility.hideStudentReviewAmount ? false : data.studentReviewAmountEditable,
    studentLinkAmountEditable: visibility.hideStudentLinkAmount ? false : data.studentLinkAmountEditable,
    allowQuranCompensation: hiddenMemorization ? false : data.allowQuranCompensation,
    allowQuranExtra: hiddenMemorization ? false : data.allowQuranExtra,
  };
}
