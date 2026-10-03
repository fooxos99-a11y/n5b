/** Word mark types in the mushaf recitation. «لحن» is graded exactly like a mistake but kept apart. */
export const RECITATION_MARK_TYPES = Object.freeze(['mistake', 'lahn', 'warning', 'hesitation']);
export const RECITATION_MARK_LABELS = Object.freeze({ mistake: 'خطأ', lahn: 'لحن', warning: 'تنبيه', hesitation: 'تردد' });
export const isMistakeMark = (markType) => markType === 'mistake' || markType === 'lahn';
export const isWarningMark = (markType) => markType === 'warning';
