import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseStudentRows, updateImportedStudent } from '../src/lib/studentImport.js';

const committees = [{ id: 7, name: 'حلقة الاختبار' }];
test('bulk import keeps separate columns and generates matching editable credentials', () => {
  const rows = parseStudentRows([
    ['الاسم', 'جوال ولي الأمر', 'رقم الهوية', 'الحلقة', 'رقم الدخول', 'كلمة المرور'],
    ['طالب تجريبي', '0500000000', '1000000000', 'حلقة الاختبار', '', ''],
    ['طالب آخر', '', '', 'حلقة الاختبار', '١٠', ''],
    ['طالب ثالث', '', '', 'حلقة الاختبار', '11', 'خاص'],
  ], new Set(['999999']), committees);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].guardianPhone, '0500000000');
  assert.equal(rows[0].nationalId, '1000000000');
  assert.equal(rows[0].committeeId, '7');
  assert.equal(rows[0].password, rows[0].loginNumber);
  assert.notEqual(rows[0].loginNumber, '999999');
  assert.equal(rows[1].loginNumber, '10');
  assert.equal(rows[1].password, '10');
  assert.equal(rows[2].password, 'خاص');
  assert.equal(updateImportedStudent(rows[1], 'loginNumber', '12').password, '12');
  assert.equal(updateImportedStudent(rows[2], 'loginNumber', '13').password, 'خاص');
});

test('headerless and reordered imports preserve identity, phone and explicit credentials', () => {
  const [row] = parseStudentRows([['طالب تجريبي', '0500000000', '1000000000', 'حلقة الاختبار', '10', '12']], new Set(), committees);
  assert.equal(row.password, '12');
  assert.equal(row.committeeId, '7');
  const [reordered] = parseStudentRows([['guardianphone', 'nationalid', 'studentname', 'loginnumber', 'password'], ['0500000000', '1000000000', 'طالب تجريبي', '10', '12']], new Set());
  assert.equal(reordered.nationalId, '1000000000');
  assert.equal(reordered.guardianPhone, '0500000000');
  assert.equal(reordered.loginNumber, '10');
  assert.throws(() => parseStudentRows([['الاسم', 'رقم الدخول'], ['طالب', '10x']], new Set()), /رقم الدخول/);
});

test('server accepts short student numbers while retaining staff number validation', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const body = source.match(/function normalizeAccountLoginNumber\([\s\S]*?\n\}/)[0];
  const normalize = vm.runInNewContext(`(${body})`, { toAsciiDigits: String, invalidInput: message => new Error(message) });
  assert.equal(normalize('10', 1), '10');
  assert.throws(() => normalize('10'));
  for (const value of ['', '1a', '-10', '1'.repeat(81)]) assert.throws(() => normalize(value, 1));
});
