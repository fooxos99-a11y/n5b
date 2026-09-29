import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manager can reset only point data from the ranking settings', async () => {
  const [server, settings, dialog, dashboard, api] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ResetPointsDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
  ]);
  const resetFunction = server.slice(
    server.indexOf('async function resetAllProgramPoints'),
    server.indexOf('async function deleteProgramDataExceptCore'),
  );

  assert.match(dashboard, /canResetPoints=\{isManager\}/);
  assert.match(settings, /<ResetPointsDialog \/>/);
  assert.match(dialog, /إعادة تعيين النقاط/);
  assert.match(dialog, /إبقاء الحضور والتسميع والخطط وبقية البيانات/);
  assert.match(dialog, /\[font-family:var\(--font-ui\)\]/);
  assert.match(api, /request\('\/settings\/reset-points'/);
  assert.match(server, /app\.post\('\/api\/settings\/reset-points', requirePermission\('settings'\),/);
  assert.match(server, /const RESET_POINTS_CONFIRM_TEXT = 'إعادة تعيين النقاط'/);

  for (const expected of [
    'DELETE FROM student_point_transactions',
    'DELETE FROM supervisor_student_point_awards',
    'DELETE FROM supervisor_family_point_awards',
    'UPDATE attendance_records SET points = 0',
    'UPDATE student_quran_tasks SET points = 0',
    'UPDATE student_quran_execution_segments SET points_awarded = 0',
    'UPDATE student_path_progress SET earned_points = 0',
    'UPDATE family_achievements SET points = 0',
    'UPDATE students SET points = 0, store_balance = 0',
    'UPDATE committees SET points = 0, student_points_contribution = 0',
  ]) {
    assert.match(resetFunction, new RegExp(expected));
  }

  assert.doesNotMatch(resetFunction, /DELETE FROM (?:attendance_records|student_quran_tasks|student_quran_plans|store_orders|family_achievements)/);
});
