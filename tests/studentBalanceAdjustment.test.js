import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertGradeAdjustmentAllowed, normalizeStudentGradeAdjustment } from '../server/services/studentBalanceAdjustment.js';

test('the balance changes only by an add or deduct amount with a reason', () => {
  assert.equal(normalizeStudentGradeAdjustment({}), null);
  assert.equal(normalizeStudentGradeAdjustment({ type: 'increase', amount: '0', reason: '' }), null);
  assert.deepEqual(normalizeStudentGradeAdjustment({ type: 'increase', amount: '20', reason: ' مشاركة ' }), { type: 'increase', grades: 20, delta: 20, reason: 'مشاركة' });
  assert.deepEqual(normalizeStudentGradeAdjustment({ type: 'deduction', amount: 30, reason: 'تصحيح' }), { type: 'deduction', grades: 30, delta: -30, reason: 'تصحيح' });
  for (const input of [{ type: 'increase', amount: '-5', reason: 'x' }, { type: 'increase', amount: 'abc', reason: 'x' }, { type: 'set', amount: 5, reason: 'x' }, { type: 'increase', amount: 5, reason: '' }]) {
    assert.throws(() => normalizeStudentGradeAdjustment(input));
  }
});

test('deductions below zero are refused instead of being cut', () => {
  assert.equal(assertGradeAdjustmentAllowed(120, { delta: 20 }), 140);
  assert.equal(assertGradeAdjustmentAllowed(120, { delta: -30 }), 90);
  assert.equal(assertGradeAdjustmentAllowed(120, { delta: -120 }), 0);
  assert.throws(() => assertGradeAdjustmentAllowed(120, { delta: -121 }), /لا يمكن خصم أكثر من الرصيد الحالي/);
  assert.equal(assertGradeAdjustmentAllowed(55, null), 55);
});

test('student edit shows the read-only balance with add or deduct and no balance type or final value field', async () => {
  const [ui, server] = await Promise.all([
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /الرصيد الحالي: <span className="tabular-nums">\{formatGrades\(selectedStudent\?\.points\)\}<\/span> درجة/);
  assert.match(ui, /<SelectItem value="increase">إضافة<\/SelectItem>\s*<SelectItem value="deduction">خصم<\/SelectItem>/);
  assert.match(ui, /min="0"[\s\S]{0,80}aria-label="عدد الدرجات"/);
  assert.doesNotMatch(ui, /pointTarget|storeBalance|الرصيد والنقاط الأساسية|الرصيد فقط|سبب تعديل النقاط/);
  assert.match(ui, /title: 'تم تعديل الرصيد'/);
  assert.match(server, /assertGradeAdjustmentAllowed\(current\.points, adjustment\)/);
  assert.match(server, /sourceType: 'manager_adjustment'/);
  assert.doesNotMatch(server, /setStudentStoreBalance|normalizePointAdjustmentTarget/);
});
