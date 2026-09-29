/** Points follow decimal grades: Latin digits with at most two fraction digits. */
export const formatPointsNumber = (value, options = {}) => Number(value || 0)
  .toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2, ...options });

export const formatPoints = (value) => `${formatPointsNumber(value)} نقطة`;
