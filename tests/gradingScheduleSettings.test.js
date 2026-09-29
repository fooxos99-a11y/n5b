import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scheduleDaysFromGradingPolicy } from '../shared/grading-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('recitation days and weekly holidays follow the grading work days', () => {
  assert.deepEqual(scheduleDaysFromGradingPolicy(), {
    recitationSessionDays: [0, 1, 2, 3, 4],
    weeklyHolidayDays: [5, 6],
  });
  assert.deepEqual(scheduleDaysFromGradingPolicy({ weeklyProgram: { workDays: [6, 0, 1, 2, 3] } }), {
    recitationSessionDays: [0, 1, 2, 3, 6],
    weeklyHolidayDays: [4, 5],
  });
});

test('the server derives schedule days from the grading policy and ignores them in general settings', async () => {
  const server = await read('../server/index.js');
  assert.match(server, /scheduleDaysFromGradingPolicy\(parseGradingPolicy\(weekPolicy\?\.policy \|\| gradingPolicyRow\?\.setting_value\)\)/);
  assert.match(server, /applyPlatformPolicies\(\{ \.\.\.normalizeSettings\(rows\), \.\.\.scheduleDays \}, policies\)/);
  assert.match(server, /weeklyHolidayDays: normalizeWeeklyHolidayDays\(previousSettings\.weeklyHolidayDays\)/);
  assert.match(server, /recitationSessionDays: normalizeWeekDayList\(previousSettings\.recitationSessionDays, DEFAULT_RECITATION_SESSION_DAYS\)/);
  assert.doesNotMatch(server, /normalizeWeekDayList\(req\.body\.recitationSessionDays/);
});

test('attendance, recitation amounts and compensation settings live in the grading settings page', async () => {
  const settings = await read('../src/components/dashboard/SettingsSection.jsx');
  const grading = settings.slice(settings.indexOf('const programPage = ('), settings.indexOf('const showSaving'));
  for (const label of ['مسؤول تحضير الطلاب', 'تعويض الحفظ المتأخر', 'تجاوز مقدار اليوم والتقدم في الخطة']) {
    assert.match(grading, new RegExp(label));
  }
  assert.match(grading, /<StaffAttendanceSettings settings=\{settings\} setSettings=\{setSettings\}>/);
  // The session always shows the amounts due up to the session day; the choice was removed.
  assert.doesNotMatch(settings, /المقادير التي تظهر في جلسة التسميع/);
  const server = await read('../server/index.js');
  assert.match(server, /const generationEndDate = minDateOnly\(sessionDate, today\);/);
  assert.doesNotMatch(settings, /أيام جلسات التسميع|أيام الإجازة الأسبوعية|مهام أيام الإجازة|طريقة عرض مقدار القرآن|تسجيل التنفيذ/);
});
