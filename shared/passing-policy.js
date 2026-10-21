import { normalizePassingRatings, passingRatingErrors, passingPercentage, passingRating } from './passing-ratings.js';

export const PASSING_POLICY_KEY = 'passingPolicy';
export const PASSING_TYPES = Object.freeze({ branch: 'اجتياز فرعي', hafiz: 'اجتياز حافظ' });
export const PASSING_FIELDS = Object.freeze([
  { key: 'maxScore', label: 'الدرجة الكاملة', min: 1, max: 1000 },
  { key: 'passScore', label: 'حد الاجتياز', min: 0, max: 1000 },
  { key: 'mistakeDeduction', label: 'خصم الخطأ/اللحن', min: 0, max: 1000 },
  { key: 'warningDeduction', label: 'خصم التنبيه', min: 0, max: 1000 },
  { key: 'hesitationDeduction', label: 'خصم التردد', min: 0, max: 1000 },
]);
const defaults = Object.freeze({ maxScore: 100, passScore: 85, mistakeDeduction: 5, warningDeduction: 1,
  hesitationDeduction: 0 });
const policyFields = row => Object.fromEntries(PASSING_FIELDS.filter(({ key }) => row && Object.hasOwn(row, key)).map(({ key }) => [key, row[key]]));
export function parsePassingPolicy(value) {
  const source = typeof value === 'string' ? JSON.parse(value) : value || {};
  return { ratings: normalizePassingRatings(source.ratings), ...Object.fromEntries(Object.keys(PASSING_TYPES).map(type => [type, {
    ...defaults, ...policyFields(source[type]),
    juzOverrides: Object.fromEntries(Object.entries(source[type]?.juzOverrides || {}).map(([juz, override]) => [juz, policyFields(override)])),
  }])) };
}
export function passingPolicyErrors(policy) {
  const errors = policy?.ratings === undefined ? {} : passingRatingErrors(policy.ratings);
  for (const type of Object.keys(PASSING_TYPES)) {
    const section = policy?.[type];
    if (!section || typeof section !== 'object' || Array.isArray(section)) { errors[type] = 'إعدادات الاجتياز غير مكتملة.'; continue; }
    const validate = (row, path) => {
      for (const field of PASSING_FIELDS) {
        const value = row[field.key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) {
          errors[`${path}.${field.key}`] = `أدخل ${field.label} من ${field.min} إلى ${field.max}.`;
        }
      }
      if (row.passScore > row.maxScore) errors[`${path}.passScore`] = 'حد الاجتياز يجب ألا يتجاوز الدرجة الكاملة.';
    };
    validate(section, type);
    if (!section.juzOverrides || typeof section.juzOverrides !== 'object' || Array.isArray(section.juzOverrides)) { errors[type] = 'تخصيص الأجزاء غير صحيح.'; continue; }
    for (const [juz, override] of Object.entries(section.juzOverrides)) {
      if (!/^(?:[1-9]|[12]\d|30)$/.test(juz) || !override || typeof override !== 'object' || Array.isArray(override)) { errors[type] = 'تخصيص الأجزاء غير صحيح.'; continue; }
      validate({ ...section, ...override }, `${type}.juzOverrides.${juz}`);
    }
  }
  return errors;
}
export function effectivePassingPolicy(policy, type, juz) {
  const section = parsePassingPolicy(policy)[type];
  const override = section.juzOverrides?.[juz] || {};
  return Object.fromEntries(PASSING_FIELDS.map(({ key }) => [key, Object.hasOwn(override, key) ? override[key] : section[key]]));
}
export function evaluatePassingPart(policy, { mistakeCount = 0, warningCount = 0, hesitationCount = 0 }) {
  const score = Math.round(Math.max(0, policy.maxScore - mistakeCount * policy.mistakeDeduction
    - warningCount * policy.warningDeduction - hesitationCount * policy.hesitationDeduction) * 10000) / 10000;
  const reasons = [];
  if (score < policy.passScore) reasons.push('الدرجة أقل من حد الاجتياز');
  const percentage = passingPercentage({ score, maxScore: policy.maxScore });
  return { score, maxScore: policy.maxScore, percentage, rating: passingRating(percentage, policy.ratings),
    passed: reasons.length === 0, reasons, mistakeCount, warningCount, hesitationCount };
}
export function passingExamStatus(parts) {
  if (parts.length && parts.every(part => part.latestAttempt?.result.passed)) return 'passed';
  if (parts.some(part => part.latestAttempt && !part.latestAttempt.result.passed)) return 'repeat';
  return parts.some(part => part.latestAttempt) ? 'in_progress' : 'pending';
}
export const PASSING_STATUS_LABELS = Object.freeze({ pending: 'لم يبدأ', in_progress: 'جارٍ', passed: 'اجتاز', repeat: 'يحتاج إعادة' });
