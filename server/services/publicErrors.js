export function publicErrorMessage(error) {
  if (['ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'].includes(error?.code)) {
    return 'الخادم مشغول بمعالجة طلب آخر. أعد المحاولة بعد قليل.';
  }
  if (error?.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return 'تعذر حفظ التسميع بسبب عدم توافق بيانات المتابعة. أعد المحاولة، وإذا استمر الخطأ تواصل مع الإدارة.';
  }
  const status = Number(error?.statusCode || error?.status);
  if (status >= 400 && status < 500 && !error?.sql) return error.message;
  return 'تعذر إكمال الطلب في الخادم. أعد المحاولة بعد قليل.';
}
