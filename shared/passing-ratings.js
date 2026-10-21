export const DEFAULT_PASSING_RATINGS = Object.freeze([
  { label: 'ممتاز', minimumPercentage: 95 },
  { label: 'جيد جدًا', minimumPercentage: 90 },
  { label: 'جيد', minimumPercentage: 85 },
  { label: 'يحتاج إعادة', minimumPercentage: 0 },
]);
export const MAX_PASSING_RATINGS = 20;
export const normalizePassingRatings = rows => (rows ?? DEFAULT_PASSING_RATINGS)
  .map(row => ({ label: String(row.label ?? '').trim(), minimumPercentage: row.minimumPercentage }))
  .sort((first, second) => second.minimumPercentage - first.minimumPercentage);
export function passingRatingErrors(rows) {
  const errors = {};
  if (!Array.isArray(rows) || rows.length > MAX_PASSING_RATINGS) return { ratings: 'يمكن إضافة عشرين تقديرًا كحد أقصى.' };
  const thresholds = new Set(), labels = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 60 || /[\p{Cc}\p{Cf}<>]/u.test(row.label)) errors[`ratings.${index}.label`] = 'أدخل اسم التقدير من حرف إلى 60 حرفًا.';
    else if (labels.has(row.label.trim())) errors[`ratings.${index}.label`] = 'اسم التقدير مكرر.';
    if (typeof row?.minimumPercentage !== 'number' || !Number.isFinite(row.minimumPercentage) || row.minimumPercentage < 0 || row.minimumPercentage > 100) errors[`ratings.${index}.minimumPercentage`] = 'أدخل نسبة من 0 إلى 100.';
    else if (thresholds.has(row.minimumPercentage)) errors[`ratings.${index}.minimumPercentage`] = 'حد التقدير مكرر.';
    if (row) { thresholds.add(row.minimumPercentage); labels.add(String(row.label ?? '').trim()); }
  }
  return errors;
}
export function passingPercentage(result) {
  const score = Number(result?.score), maximum = Number(result?.maxScore);
  return result && Number.isFinite(score) && Number.isFinite(maximum) && maximum > 0
    ? Math.round(Math.max(0, Math.min(100, score / maximum * 100)) * 10000) / 10000 : null;
}
export function passingRating(percentage, ratings) {
  if (percentage === null || !Array.isArray(ratings)) return null;
  return [...ratings].sort((first, second) => second.minimumPercentage - first.minimumPercentage)
    .find(row => percentage >= row.minimumPercentage)?.label || null;
}
export const formatPassingPercentage = value => value === null || value === undefined ? '—'
  : `${Number(value).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })}٪`;
