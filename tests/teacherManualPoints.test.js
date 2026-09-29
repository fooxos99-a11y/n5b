import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeTeacherPointTypes } from '../shared/teacher-point-types.js';

test('teacher point types normalize names, operations, points, and duplicate ids', () => {
  assert.deepEqual(normalizeTeacherPointTypes([
    { id: 'behavior', label: '  مخالفة سلوكية  ', operation: 'deduction', points: 5 },
    { id: 'behavior', label: 'تميز', operation: 'increase', points: 10 },
    { id: 'invalid-points', label: 'تنبيه', operation: 'deduction', points: 'غير صالح' },
    { id: 'empty', label: '', operation: 'deduction', points: 2 },
  ]), [
    { id: 'behavior', label: 'مخالفة سلوكية', operation: 'deduction', points: 5 },
    { id: 'behavior-2', label: 'تميز', operation: 'increase', points: 10 },
    { id: 'invalid-points', label: 'تنبيه', operation: 'deduction', points: 1 },
  ]);
});

test('teacher manual points use manager-defined types and stay term limited and committee scoped', async () => {
  const [server, accountPortal, settings, typeSettings, page, report, api, routes, catalog, normalizer] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/TeacherPointTypesSetting.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherPointsAdjustmentSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/reports/reportMetrics.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../shared/platform-settings-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../shared/teacher-point-types.js', import.meta.url), 'utf8'),
  ]);

  assert.match(catalog, /teacherManualPointsEnabled/);
  assert.match(catalog, /teacherManualPointsTermLimit/);
  assert.match(catalog, /teacherPointTypes/);
  assert.match(settings, /label="السماح للمعلم بالإضافة والخصم"/);
  assert.match(settings, /valueLabel="الحد في الفصل"/);
  assert.match(settings, /<TeacherPointTypesSetting/);
  assert.match(typeSettings, /اسم النوع/);
  assert.match(typeSettings, /label: 'نوع خصم'/);
  assert.match(typeSettings, /operation === 'deduction' \? 'نوع خصم' : 'نوع إضافة'/);
  assert.match(typeSettings, /SelectItem value="deduction">خصم/);
  assert.match(typeSettings, /عدد النقاط/);
  assert.match(normalizer, /normalizeTeacherPointTypes/);
  assert.match(server, /app\.get\('\/api\/teacher-points\/students'/);
  assert.match(server, /app\.post\('\/api\/teacher-points\/adjustments'/);
  assert.match(server, /sc\.supervisor_id = \?/);
  assert.match(server, /SELECT id FROM supervisors WHERE id = \? FOR UPDATE/);
  assert.match(server, /source_type IN \('supervisor_award', 'supervisor_deduction'\)/);
  assert.match(server, /transaction_date >= \?/);
  assert.match(server, /تجاوزت حد المعلم في الفصل/);
  assert.match(server, /settings\.teacherPointTypes\.find\(\(item\) => item\.id === adjustmentTypeId\)/);
  assert.match(server, /const points = adjustmentType\.points/);
  assert.match(server, /note\.length > 400/);
  assert.match(server, /رصيد الطالب لا يكفي لتنفيذ هذا الخصم/);
  assert.doesNotMatch(server, /createDirectAppNotification|buildTeacherPointsNotification/);
  assert.doesNotMatch(accountPortal, /useAppNotificationPolling|NotificationsSection/);
  assert.match(api, /getTeacherPointStudents/);
  assert.match(api, /adjustTeacherStudentPoints/);
  assert.match(page, /id="teacher-points-student"/);
  assert.match(page, /id="teacher-points-type"/);
  assert.match(page, /id="teacher-points-reason"/);
  assert.match(page, /ملاحظة \(اختياري\)/);
  assert.doesNotMatch(page, /teacher-points-amount/);
  assert.match(page, /adjustmentTypeId: selectedType\.id/);
  assert.match(page, />\s*حفظ\s*<\/Button>/);
  assert.match(report, /row\.reason/);
  assert.match(report, /label: 'الإضافة والخصم'/);
  assert.match(report, /row\.type === 'increase' \? '\+' : '-'/);
  assert.match(routes, /\['teacherPoints', 'points-adjustment'\]/);
});
