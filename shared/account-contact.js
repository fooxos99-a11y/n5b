const toAsciiDigits = (value = '') => String(value).replace(/[٠-٩۰-۹]/g, (digit) => {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicIndex = arabicDigits.indexOf(digit);
  return String(arabicIndex >= 0 ? arabicIndex : persianDigits.indexOf(digit));
});

export function normalizeOptionalAccountNumber(value, label = 'الرقم') {
  const digits = toAsciiDigits(value).replace(/\D/g, '');
  if (digits.length > 40) throw new RangeError(`${label} يجب ألا يتجاوز 40 رقمًا.`);
  return digits;
}


export function normalizeOptionalPhone(value) {
  const text = toAsciiDigits(value ?? '').trim();
  if (!text) return '';
  if (!/^\+?[0-9 ()-]+$/.test(text)) throw new RangeError('رقم الجوال غير صحيح.');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) throw new RangeError('رقم الجوال يجب أن يتكون من 9 إلى 15 رقمًا.');
  return digits;
}

export function normalizeOptionalIdentity(value) {
  const text = toAsciiDigits(value ?? '').trim();
  if (!text) return '';
  if (!/^\d{10}$/.test(text)) throw new RangeError('رقم الهوية يجب أن يتكون من 10 أرقام.');
  return text;
}
