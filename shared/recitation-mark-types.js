/** Word mark types in the mushaf recitation. «لحن» is graded exactly like a mistake but kept apart. */
export const RECITATION_MARK_TYPES = Object.freeze(['mistake', 'lahn', 'warning']);
export const RECITATION_MARK_LABELS = Object.freeze({ mistake: 'خطأ', lahn: 'لحن', warning: 'تنبيه' });
export const isMistakeMark = (markType) => markType === 'mistake' || markType === 'lahn';
export const isWarningMark = (markType) => markType === 'warning';
