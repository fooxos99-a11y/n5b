import test from 'node:test';
import assert from 'node:assert/strict';
import { studentSessionResult, studentSessionGroupResult } from '../src/lib/studentSessionResult.js';
import { studentPlanLevel } from '../src/lib/studentPlanLevel.js';
test('session results have one label without duplicated imported ratings', () => {
 assert.equal(studentSessionResult({ teacherCompleted: false, teacherRatingLabel: 'لم يتم الربط' }).label, 'راسب');
 assert.equal(studentSessionResult({ teacherCompleted: true, teacherRatingLabel: 'متقن' }).label, 'متقن');
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
 assert.equal(studentSessionGroupResult([{teacherCompleted: true}, {teacherCompleted: true}]).label, 'متقن');
 assert.equal(studentSessionGroupResult([{teacherCompleted: true, mistakeCount: 1}, {teacherCompleted: false, warningCount: 2}]).label, 'راسب · 1 أخطاء، 2 تنبيهات');
 assert.equal(studentSessionGroupResult([{teacherCompleted: true}, {teacherCompleted: false}]).label, 'راسب');
});
