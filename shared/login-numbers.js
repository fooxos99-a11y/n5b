import { secureRandomInt, secureRandomItem } from './secure-random.js';

export function generateStudentLoginNumber(usedLoginNumbers) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const value = String(100000 + secureRandomInt(900000));
    if (!usedLoginNumbers.has(value)) { usedLoginNumbers.add(value); return value; }
  }
  throw new Error('تعذر توليد رقم دخول متاح. أدخل الرقم يدويًا.');
}

export function generateThreeDigitLoginNumber(usedLoginNumbers) {
  const available = [];
  for (let number = 100; number <= 999; number += 1) {
    const value = String(number);
    if (!usedLoginNumbers.has(value)) available.push(value);
  }
  if (!available.length) return '';
  const value = secureRandomItem(available);
  usedLoginNumbers.add(value);
  return value;
}
