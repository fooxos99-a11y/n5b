import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  calculateWeeklyReviewDailyPages,
  classifyPlanExecution,
  comparePlanPosition,
  countScheduledPlanDays,
  getPlanExecutionLimit,
} from '../server/services/quranPlanProgress.js';

const position = (ayah, surah = 2, page = 1) => ({ page, surah, ayah });

test('scheduled days respect the stored plan weekdays', () => {
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-01',
    endDate: '2026-09-07',
    scheduleDays: [0, 1, 2, 3, 4],
  }), 5);
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-04',
    endDate: '2026-09-05',
    scheduleDays: [0, 1, 2, 3, 4],
  }), 0);
});

test('weekly review divides every available review page and honors the daily minimum', () => {
  assert.equal(calculateWeeklyReviewDailyPages({
    availableReviewPages: 123,
    reviewDays: 5,
    minimumDailyPages: 10,
  }), 25);
  assert.equal(calculateWeeklyReviewDailyPages({
    availableReviewPages: 20,
    reviewDays: 5,
    minimumDailyPages: 10,
  }), 10);
  assert.equal(calculateWeeklyReviewDailyPages({
    availableReviewPages: 6,
    reviewDays: 5,
    minimumDailyPages: 10,
  }), 6);
  assert.equal(calculateWeeklyReviewDailyPages({
    availableReviewPages: 89,
    reviewDays: 7,
    minimumDailyPages: 1,
  }), 13);
});

test('the exact day-two example is split into normal, compensation, and extra', () => {
  const segments = classifyPlanExecution({
    actualStart: position(4),
    normalEnd: position(8),
    scheduledEnd: position(10),
    actualEnd: position(12),
    allowCompensation: true,
    allowExtra: true,
  });
  assert.deepEqual(segments.map((segment) => segment.type), ['normal', 'compensation', 'extra']);
  assert.equal(segments[0].end.ayah, 8);
  assert.equal(segments[1].startAfter.ayah, 8);
  assert.equal(segments[1].end.ayah, 10);
  assert.equal(segments[2].startAfter.ayah, 10);
  assert.equal(segments[2].end.ayah, 12);
});

test('partial, full compensation, and disabled compensation use strict limits', () => {
  assert.deepEqual(classifyPlanExecution({
    actualStart: position(4),
    normalEnd: position(8),
    scheduledEnd: position(10),
    actualEnd: position(6),
  }).map((segment) => [segment.type, segment.end.ayah]), [['normal', 6]]);

  assert.equal(getPlanExecutionLimit({
    normalEnd: position(8),
    scheduledEnd: position(10),
    extraEnd: position(20),
    allowCompensation: true,
    allowExtra: false,
  }).ayah, 10);
  assert.equal(getPlanExecutionLimit({
    normalEnd: position(8),
    scheduledEnd: position(10),
    extraEnd: position(20),
    allowCompensation: false,
    allowExtra: true,
  }).ayah, 8);
  assert.throws(() => classifyPlanExecution({
    actualStart: position(4),
    normalEnd: position(8),
    scheduledEnd: position(10),
    actualEnd: position(9),
    allowCompensation: false,
    allowExtra: true,
  }), /التعويض غير مسموح/);
});

test('an overdue range scheduled for today is classified as ordinary memorization', () => {
  const scheduledEnd = position(17);
  const segments = classifyPlanExecution({
    actualStart: position(9),
    normalEnd: scheduledEnd,
    scheduledEnd,
    actualEnd: scheduledEnd,
    allowCompensation: false,
    allowExtra: false,
  });
  assert.deepEqual(segments, [{ type: 'normal', start: position(9), end: scheduledEnd }]);
});

test('scheduled memorization rewards the scheduled amount normally and the increase as extra', () => {
  const segments = classifyPlanExecution({
    actualStart: position(9),
    normalEnd: position(17),
    scheduledEnd: position(17),
    actualEnd: position(21),
    allowCompensation: false,
    allowExtra: true,
  });
  assert.deepEqual(segments.map((segment) => segment.type), ['normal', 'extra']);
  assert.equal(segments[0].end.ayah, 17);
  assert.equal(segments[1].startAfter.ayah, 17);
  assert.equal(segments[1].end.ayah, 21);
});

test('an ahead student has no compensation and extra begins after the normal amount', () => {
  const segments = classifyPlanExecution({
    actualStart: position(13),
    normalEnd: position(17),
    scheduledEnd: position(15),
    actualEnd: position(19),
    allowCompensation: true,
    allowExtra: true,
  });
  assert.deepEqual(segments.map((segment) => segment.type), ['normal', 'extra']);
  assert.equal(segments[1].startAfter.ayah, 17);
});

test('full execution stays normal and partial execution ends exactly at the selected position', () => {
  assert.deepEqual(classifyPlanExecution({
    actualStart: position(1),
    normalEnd: position(5),
    scheduledEnd: position(5),
    actualEnd: position(5),
  }), [{ type: 'normal', start: position(1), end: position(5) }]);
  assert.equal(classifyPlanExecution({
    actualStart: position(1),
    normalEnd: position(5),
    scheduledEnd: position(5),
    actualEnd: position(3),
  })[0].end.ayah, 3);
});

test('one-day and multi-day delays accumulate only on eligible plan days', () => {
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-01', endDate: '2026-09-01', scheduleDays: [2],
  }), 1);
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-01', endDate: '2026-09-08', scheduleDays: [2, 3, 4],
  }), 4);
});

test('partial, full, and multiple-unit compensation never overlap normal work', () => {
  for (const actualEnd of [position(7), position(10), position(15)]) {
    const segments = classifyPlanExecution({
      actualStart: position(1),
      normalEnd: position(5),
      scheduledEnd: position(15),
      actualEnd,
      allowCompensation: true,
    });
    assert.equal(segments[0].end.ayah, 5);
    assert.equal(segments[1].startAfter.ayah, 5);
    assert.equal(segments[1].end.ayah, actualEnd.ayah);
  }
});

test('cross-surah execution is classified by Quran position rather than global ayah number', () => {
  const segments = classifyPlanExecution({
    actualStart: position(284, 2, 49),
    normalEnd: position(286, 2, 49),
    scheduledEnd: position(2, 3, 50),
    actualEnd: position(4, 3, 50),
    allowCompensation: true,
    allowExtra: true,
  });
  assert.deepEqual(segments.map((segment) => segment.type), ['normal', 'compensation', 'extra']);
  assert.deepEqual(segments[1].end, position(2, 3, 50));
});

test('changing plan days and start date changes only future theoretical day counts', () => {
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-01', endDate: '2026-09-07', scheduleDays: [0, 1, 2, 3, 4],
  }), 5);
  assert.equal(countScheduledPlanDays({
    startDate: '2026-09-03', endDate: '2026-09-07', scheduleDays: [0, 2, 4],
  }), 2);
  assert.equal(countScheduledPlanDays({ startDate: '', endDate: '2026-09-07' }), 0);
});

test('contiguous segment boundaries do not repeat an already-counted ayah', () => {
  const segments = classifyPlanExecution({
    actualStart: position(4),
    normalEnd: position(8),
    scheduledEnd: position(10),
    actualEnd: position(12),
    allowCompensation: true,
    allowExtra: true,
  });
  assert.equal(segments[1].startAfter.ayah, segments[0].end.ayah);
  assert.equal(segments[2].startAfter.ayah, segments[1].end.ayah);
});

test('reverse-surah traversal keeps the existing Quran direction semantics', () => {
  assert.ok(comparePlanPosition({ page: 50, surah: 5, ayah: 1 }, { page: 40, surah: 4, ayah: 1 }, -1) < 0);
  assert.ok(comparePlanPosition({ page: 40, surah: 4, ayah: 2 }, { page: 40, surah: 4, ayah: 1 }, -1) > 0);
});

test('schema, settings, plan UI, and teacher range endpoint persist the new model', async () => {
  const [database, server, plans, settings, teacherList, teacherEvaluation, inlineSetting] = await Promise.all([
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/inline-toggle-number-setting.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(database, /student_quran_execution_segments/);
  assert.match(database, /segment_type ENUM\('normal', 'compensation', 'extra'\)/);
  assert.match(database, /quran_plan_user_preferences/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS supervisor_committees[\s\S]*committee_id BIGINT UNSIGNED NOT NULL/);
  assert.match(database, /previous_plan_id/);
  assert.match(database, /effective_from/);
  assert.match(server, /planScheduleDates/);
  assert.match(server, /quran-evaluation\/:taskId\/range/);
  assert.match(server, /saveQuranExecutionSegments/);
  const rangeEndpoint = server.slice(server.indexOf("app.post('/api/supervisors/:id/quran-evaluation/:taskId/range'"), server.indexOf("app.get('/api/supervisors/:id/quran-evaluation/:taskId/ayahs'"));
  assert.match(rangeEndpoint, /newer\.task_date <= \?/);
  assert.match(rangeEndpoint, /extendRecitationTaskRange/);
  const extension = server.slice(server.indexOf("async function extendRecitationTaskRange("));
  assert.match(extension, /SET to_page = \?, to_surah = \?, to_ayah = \?/);
  assert.match(server, /status = 'paused'/);
  assert.match(server, /schedule_days_json/);
  assert.doesNotMatch(plans, /تطبيق التعديل من تاريخ/);
  assert.doesNotMatch(plans, /نهاية الدورة/);
  assert.match(plans, /startDate: minimumPlanStartDate/);
  assert.match(plans, /startDate: plan\.startDate \|\| minimumPlanStartDate/);
  assert.match(plans, /priorMemorization: Array\.isArray\(plan\.priorMemorization\) \? plan\.priorMemorization : \[\]/);
  assert.match(plans, /min=\{minimumPlanStartDate\}/);
  assert.match(server, /startDate < minimumPlanStartDate[\s\S]*بداية الخطة يجب ألا تسبق/);
  assert.match(plans, /نسبة الإنجاز/);
  assert.doesNotMatch(plans, /النقص \{numberText/);
  assert.match(plans, /DashboardDatePicker/);
  assert.doesNotMatch(plans, /setForm\(\{ \.\.\.form/);
  assert.match(settings, /label="تعويض الحفظ المتأخر"/);
  assert.doesNotMatch(settings, /نسبة التعويض بالمئة|PointsPercent/);
  assert.match(inlineSetting, /font-normal/);
  assert.match(settings, /label="تجاوز مقدار اليوم والتقدم في الخطة"/);
  assert.doesNotMatch(settings, /label="تعديل مقدار المراجعة اليومية"/);
  assert.doesNotMatch(settings, /label="تعديل مقدار الربط"/);
  assert.doesNotMatch(settings, /label="السماح للطالب بتغيير عدد التكرارات"/);
  assert.match(settings, /GradingSettingsPanel/);
  assert.match(teacherList, /RecitationEndSelector/);
  assert.match(teacherEvaluation, /taskIds: \(student\.tasks \|\| \[\]\)\.map/);
  assert.match(rangeEndpoint, /buildRequestedRecitationTaskScope\(req, taskId, anchor\)/);
  const requestedScope = server.slice(server.indexOf("function buildRequestedRecitationTaskScope("), server.indexOf("function buildRequestedRecitationTaskScope(") + 900);
  assert.match(requestedScope, /req\.body\.taskIds/);
  assert.match(server, /const startDate = notStartedPlan \? requestedStartDate : continuedPlan\?\.startDate \|\| requestedStartDate/);
  assert.match(server, /const effectiveFrom = continuedPlan && !notStartedPlan \? minimumPlanStartDate : startDate/);
  assert.match(server, /getPlanProgressContext/);
  assert.match(server, /recitationAmountDay: normalizeRecitationAmountDay/);
  assert.match(server, /getQuranTraversalPageEnd\(connection, cursor, endLimit, 1\)/);
  assert.match(server, /repairUnevaluatedMemorizationTaskRange/);
  assert.match(server, /student_quran_recitation_attempts attempt WHERE attempt\.task_id = t\.id/);
  assert.match(settings, /مسؤول تحضير الطلاب/);
  assert.match(settings, /section="program"/);
  assert.doesNotMatch(server, /requestedTargetEndDate/);
  assert.doesNotMatch(server, /requestedEffectiveFrom/);
  assert.match(server, /app\.delete\('\/api\/student-plans\/:studentId'[\s\S]*hasSupervisorStudentPlanAccess\(req, studentId\)[\s\S]*status = 'paused'/);
  assert.match(server, /JOIN student_quran_plans p ON p\.id = t\.plan_id[\s\S]*WHERE \(\$\{currentQuranPlanSql\('p'\)\} OR \$\{retryableAttemptFilter\} OR \$\{studentExecutedMemorizationCondition\}\)[\s\S]*t\.task_date <= \?/);
  assert.match(plans, /studentsApi\.deleteStudentPlan/);
  assert.match(plans, /aria-label=\{`إدارة حذف خطة ومحفوظات \$\{row\.studentName\}`\}/);
  assert.match(plans, /حذف الخطة الحالية/);
  assert.doesNotMatch(plans, /BookOpen/);
});

test('teacher range selector allows changing both the ending surah and ayah', async () => {
  const selector = await readFile(new URL('../src/components/portal/RecitationEndSelector.jsx', import.meta.url), 'utf8');
  assert.match(selector, /ariaLabel="سورة النهاية"/);
  assert.match(selector, /ariaLabel="آية النهاية"/);
  assert.match(selector, /chapters = \[\]/);
  assert.match(selector, /canonicalStart/);
  assert.match(selector, /chapter\.ayahCount/);
  assert.doesNotMatch(selector, /surahs\.length > 1/);
});
