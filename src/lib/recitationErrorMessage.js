export function recitationErrorMessage(error, fallback = 'تعذرت العملية. أعد المحاولة.') {
  const message = String(error?.message || '');
  return /FetchEvent|Load failed|Failed to fetch|NetworkError|network request failed/i.test(message)
    ? 'تعذر الاتصال بالخادم. التقييم المحفوظ على الجهاز سيُرسل تلقائيًا عند عودة الاتصال.'
    : message || fallback;
}
