export const normalizeNumericInput = (value, maxLength = 20) => String(value || '')
  .replace(/[٠-٩]/g, (digit) => String(digit.codePointAt(0) - 1632))
  .replace(/[۰-۹]/g, (digit) => String(digit.codePointAt(0) - 1776))
  .replace(/\D/g, '')
  .slice(0, maxLength);
