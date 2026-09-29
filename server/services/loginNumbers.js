export { generateThreeDigitLoginNumber } from '../../shared/login-numbers.js';

export function normalizeThreeDigitLoginNumber(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return /^\d{3}$/.test(digits) ? digits : '';
}

export async function loadUsedLoginNumbers(connection) {
  const [rows] = await connection.query(`
    SELECT login_number AS loginNumber FROM students
    UNION
    SELECT login_number AS loginNumber FROM supervisors
  `);
  return new Set(rows.map((row) => String(row.loginNumber || '').trim()).filter(Boolean));
}
