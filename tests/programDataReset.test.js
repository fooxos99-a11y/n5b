import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('program data reset removes operational accounts but preserves manager access and core settings', () => {
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const resetStart = server.indexOf('async function deleteProgramDataExceptCore');
  const resetEnd = server.indexOf('function isValidTimeString', resetStart);
  const reset = server.slice(resetStart, resetEnd);

  assert.match(server, /DELETE_PROGRAM_DATA_CONFIRM_TEXT = 'حذف جميع البيانات'/);
  assert.match(reset, /DELETE FROM students/);
  assert.match(reset, /DELETE FROM committees/);
  assert.match(reset, /DELETE FROM supervisors WHERE role <> 'manager'/);
  assert.match(reset, /DELETE FROM report_archives/);
  assert.match(reset, /DELETE FROM auth_sessions WHERE user_role <> 'manager'/);
  assert.doesNotMatch(reset, /DELETE FROM app_settings/);
});
