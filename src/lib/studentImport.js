import { generateStudentLoginNumber as generateLoginNumber } from '../../shared/login-numbers.js';

const normalizeCell = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeKey = (value) =>
  normalizeCell(value)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replaceAll('ؤ', 'و')
    .replaceAll('ئ', 'ي')
    .replaceAll('ة', 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '');

const toEnglishDigits = (value) =>
  normalizeCell(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(persianDigits.indexOf(digit));
  });

const toDigits = (value) => toEnglishDigits(value).replace(/[^\d]/g, '');
const normalizeLoginNumber = (value) => {
  const digits = toEnglishDigits(value);
  if (digits && !/^\d{1,80}$/.test(digits)) throw new Error('رقم الدخول في الملف غير صحيح. استخدم من 1 إلى 80 رقمًا.');
  return digits;
};

const normalizePhone = (value) => {
  const digits = toDigits(value);
  if (!digits) return '';
  if (digits.startsWith('9665') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith('05')) return digits;
  if (digits.startsWith('5') && digits.length === 9) return `0${digits}`;
  return digits;
};

const toNamePart = (value) =>
  toEnglishDigits(value)
    .replace(/[0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const headerAliases = {
  name: ['اسم', 'الاسم', 'اسمالطالب', 'الطالب', 'student', 'studentname', 'name'],
  phone: ['جوال', 'الجوال', 'رقمالجوال', 'جوالوليالامر', 'رقمجوالوليالامر', 'هاتف', 'الهاتف', 'phone', 'mobile', 'guardianphone'],
  studentPhone: ['جوالالطالب', 'رقمجوالالطالب', 'studentphone'],
  nationalId: ['identity', 'nationalid', 'id', '\u0647\u0648\u064a\u0629', '\u0627\u0644\u0647\u0648\u064a\u0629', '\u0631\u0642\u0645\u0627\u0644\u0647\u0648\u064a\u0629'],
  loginNumber: ['رقمالدخول', 'دخول', 'login', 'loginnumber'],
  password: ['كلمةالمرور', 'كلمهالمرور', 'الرمز', 'رمز', 'password'],
  committee: ['اسرة', 'الاسرة', 'حلقة', 'الحلقة', 'اسمالحلقة', 'العائلة', 'family', 'committee'],
};

const findHeaderMapping = (rows) => {
  const maxHeaderRows = Math.min(rows.length, 8);
  for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex += 1) {
    const mapping = {};
    (rows[rowIndex] || []).forEach((cell, cellIndex) => {
      const key = normalizeKey(cell);
      Object.entries(headerAliases).forEach(([field, aliases]) => {
        if (mapping[field] !== undefined) return;
        if (aliases.some((alias) => key === normalizeKey(alias))) {
          mapping[field] = cellIndex;
        }
      });
    });
    if (mapping.name !== undefined) {
      return { mapping, startIndex: rowIndex + 1 };
    }
  }

  return {
    mapping: { name: 0, phone: 1, nationalId: 2, committee: 3, loginNumber: 4, password: 5 },
    startIndex: 0,
  };
};

export const parseStudentRows = (rows, usedLoginNumbers, committees = []) => {
  const safeRows = rows.filter(Array.isArray).filter((row) => row.some((cell) => normalizeCell(cell)));
  const committeeByName = new Map(
    committees.map((committee) => [normalizeKey(committee.name), String(committee.id)])
  );
  const { mapping, startIndex } = findHeaderMapping(safeRows);

  return safeRows
    .slice(startIndex)
    .map((row, index) => {
      const name = toNamePart(row[mapping.name]);
      const phone = mapping.phone === undefined ? '' : normalizePhone(row[mapping.phone]);
      const nationalId = mapping.nationalId === undefined ? '' : toDigits(row[mapping.nationalId]);
      const loginFromFile = mapping.loginNumber === undefined ? '' : normalizeLoginNumber(row[mapping.loginNumber]);
      const committeeFromFile = mapping.committee === undefined
        ? ''
        : committeeByName.get(normalizeKey(row[mapping.committee])) || '';
      const rowText = row.map(normalizeCell).join(' ');

      if (/اسم|طالب|جوال|ولي|هاتف|رقم|هوية/i.test(rowText) && !name) return null;
      if (!name) return null;

      const loginNumber = loginFromFile || generateLoginNumber(usedLoginNumbers);
      if (loginNumber) usedLoginNumbers.add(loginNumber);

      return {
        rowId: `${Date.now()}-${startIndex + index}`,
        name,
        loginNumber,
        password: (mapping.password === undefined ? '' : String(row[mapping.password] ?? '')) || loginNumber,
        nationalId,
        guardianPhone: phone,
        phone: mapping.studentPhone === undefined ? '' : normalizePhone(row[mapping.studentPhone]),
        complexId: String(committees.find(committee => String(committee.id) === committeeFromFile)?.complexId || ''),
        committeeId: committeeFromFile,
      };
    })
    .filter(Boolean);
};

const detectCsvDelimiter = (text) => {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, delimiter) => {
    const count = sample.split(delimiter).length;
    return count > best.count ? { delimiter, count } : best;
  }, { delimiter: ',', count: 0 }).delimiter;
};

const parseCsvRows = (text) => {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((csvRow) => csvRow.some((value) => normalizeCell(value)));
};

export const readSpreadsheetSheets = async (file) => {
  const fileName = String(file.name || '').toLowerCase();

  if (fileName.endsWith('.csv') || file.type === 'text/csv') {
    return [{ name: 'CSV', rows: parseCsvRows(await file.text()) }];
  }

  if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
    throw new Error('صيغة .xls القديمة غير مدعومة. احفظ الملف بصيغة .xlsx أو CSV ثم ارفعه.');
  }

  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  if (Array.isArray(sheets) && sheets[0]?.data) {
    return sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data || [] }));
  }

  return [{ name: 'Sheet1', rows: Array.isArray(sheets) ? sheets : [] }];
};

export const parseBestStudentSheet = (sheets, usedLoginNumbers, committees) => {
  let best = { parsed: [], sheetName: '' };

  sheets.forEach((sheet) => {
    const candidateUsedNumbers = new Set(usedLoginNumbers);
    const parsed = parseStudentRows(sheet.rows || [], candidateUsedNumbers, committees);
    if (parsed.length > best.parsed.length) {
      best = { parsed, sheetName: sheet.name || '' };
    }
  });

  best.parsed.forEach((student) => {
    if (student.loginNumber) usedLoginNumbers.add(student.loginNumber);
  });

  return best;
};


export function updateImportedStudent(student, field, value) {
  return { ...student, [field]: value, ...(field === 'loginNumber' && student.password === student.loginNumber ? { password: value } : {}) };
}
