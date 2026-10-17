import test from 'node:test';
import assert from 'node:assert/strict';
import { studentSessionResult, studentSessionGroupResult, studentSessionMarks, groupSessionTasksByGradeDate } from '../src/lib/studentSessionResult.js';
import { studentPlanLevel } from '../src/lib/studentPlanLevel.js';
test('session results have one label without duplicated imported ratings', () => {
 assert.equal(studentSessionResult({ teacherCompleted: false, teacherRatingLabel: 'لم يتم الربط' }).label, 'راسب');
 assert.equal(studentSessionResult({ teacherCompleted: true, teacherRatingLabel: 'متقن' }).label, 'تم التسميع');
 assert.equal(studentSessionResult({ teacherCompleted: true, mistakeCount: 3 }).label, '3 أخطاء');
 assert.equal(studentSessionResult({ teacherCompleted: true, warningCount: 2 }).label, '2 تنبيهات');
 assert.equal(studentSessionResult({ teacherCompleted: false, mistakeCount: 3 }).label, 'راسب · 3 أخطاء');
 assert.equal(studentSessionResult({ teacherCompleted: null }).label, 'بانتظار التقييم');
});
test('plan bar measures the full current plan without resetting at milestones', () => {
 assert.deepEqual(studentPlanLevel({ totalAyahs: 1000, completedAyahs: 20 }), 2);
 assert.deepEqual(studentPlanLevel({ totalAyahs: 1000, completedAyahs: 90 }), 9);
 assert.deepEqual(studentPlanLevel({ totalAyahs: 1000, completedAyahs: 100 }), 10);
 assert.deepEqual(studentPlanLevel({ totalAyahs: 1000, completedAyahs: 1000 }), 100);
});

test('split review and link ranges share one result and wait for every range', () => {
 assert.equal(studentSessionGroupResult([{teacherCompleted: null}, {teacherCompleted: true}]).label, 'بانتظار التقييم');
 assert.equal(studentSessionGroupResult([{teacherCompleted: true}, {teacherCompleted: true}]).label, 'تم التسميع');
 assert.equal(studentSessionGroupResult([{teacherCompleted: true, mistakeCount: 1}, {teacherCompleted: false, warningCount: 2}]).label, 'راسب · 1 أخطاء، 2 تنبيهات');
 assert.equal(studentSessionGroupResult([{teacherCompleted: true}, {teacherCompleted: false}]).label, 'راسب');
});


test('session grade uses the saved daily program weight and ignores the technical 100 scale', () => {
 const task = { teacherCompleted: true, evaluationScore: 100, evaluationMaxScore: 100, programGrade: { grade: 1, max: 1 } };
 assert.equal(studentSessionResult(task).label, 'الدرجة 1 من 1');
 assert.equal(studentSessionGroupResult([task, task]).label, 'الدرجة 1 من 1');
 assert.equal(studentSessionResult({ ...task, programGrade: null }).label, 'تم التسميع');
 assert.equal(studentSessionResult({ ...task, programGrade: { grade: 0, max: 0 } }).label, 'الدرجة 0 من 0');
 assert.equal(studentSessionGroupResult([task], { grade: 0.75, max: 2 }).label, 'الدرجة 0.75 من 2');
 assert.equal(groupSessionTasksByGradeDate([{ taskDate: '2026-10-16' }, { taskDate: '2026-10-17' }]).length, 2);
});

test('feedback preserves the current session typed selections and separates legacy count types', () => {
 const word = { markType: 'lahn', selectedText: 'لفظ محدد', notes: 'ملاحظة الجلسة' };
 assert.deepEqual(studentSessionMarks({ wordMarks: [word], ayahMarks: [{ markType: 'warning' }] }), [word]);
 assert.deepEqual(studentSessionMarks({ ayahMarks: [{ mistakeCount: 1, warningCount: 2, hesitationCount: 3 }] }).map(mark => [mark.markType, mark.count]), [['mistake', 1], ['warning', 2], ['hesitation', 3]]);
 assert.deepEqual(studentSessionMarks({}), []);
});
