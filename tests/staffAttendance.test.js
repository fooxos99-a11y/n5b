import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { up as applyStaffAttendanceMigration } from '../server/migrations/2026.08.17.5-staff-attendance.js';
import { calculateBuraidahAsr, getStaffAttendanceStatus } from '../server/services/prayerTimes.js';

test('Buraidah Asr is calculated daily and the configurable grace period determines lateness', () => {
  const summerAsr = calculateBuraidahAsr('2026-08-17');
  const winterAsr = calculateBuraidahAsr('2026-12-17');
  assert.match(summerAsr, /^15:/);
  assert.match(winterAsr, /^(14|15):/);
  assert.equal(getStaffAttendanceStatus('2026-08-17', '15:00', 50).status, 'present');
  assert.equal(getStaffAttendanceStatus('2026-08-17', '16:40', 50).status, 'late');
});

test('staff attendance covers teachers, reciters, and administrators with location and daily uniqueness', async () => {
  const [router, migration, server, settings, dashboard, portal, report, clientPermissions, serverPermissions] = await Promise.all([
    readFile(new URL('../server/routes/staffAttendanceRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.17.5-staff-attendance.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'StaffAttendanceSettings.jsx'].map((name) => readFile(new URL(`../src/components/dashboard/${name}`, import.meta.url), 'utf8'))).then((parts) => parts.join('\n')),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/dashboardPermissions.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/dashboardPermissions.js', import.meta.url), 'utf8'),
  ]);
  assert.match(router, /STAFF_ATTENDANCE_RADIUS_METERS/);
  assert.match(router, /distance > STAFF_ATTENDANCE_RADIUS_METERS/);
  assert.match(router, /getStaffAttendanceStatus/);
  assert.match(migration, /check_in_method/);
  assert.match(server, /role IN \('supervisor', 'reciter', 'admin'\)/);
  assert.match(settings, /تحضير الكادر عن طريق/);
  // The late minutes and location link are no longer edited in the settings.
  assert.doesNotMatch(settings, /وقت التأخير بعد صلاة العصر|رابط موقع التحضير/);
  assert.match(dashboard, /StaffAttendancePrompt/);
  assert.match(dashboard, /key: 'staffAttendance', label: 'تحضير حسابي'/);
  assert.match(dashboard, /settings\.staffAttendanceSource === 'teacher'/);
  assert.match(portal, /StaffAttendancePrompt/);
  assert.match(portal, /settings\.staffAttendanceSource === 'teacher'/);
  assert.ok(portal.indexOf("key: 'staffAttendance', label: 'التحضير'") < portal.indexOf("key: 'quranEvaluation', label: 'جلسات التسميع'"));
  // Staff attendance is not part of the statistics page.
  assert.doesNotMatch(report, /getSupervisorReport|showStaff/);
  assert.match(clientPermissions, /key: 'staffAttendance', label: 'تحضير حسابي'/);
  assert.doesNotMatch(clientPermissions, /description:/);
  assert.match(serverPermissions, /'staffAttendance'/);
  assert.match(server, /\[path\.startsWith\('\/staff-attendance'\), \['staffAttendance'\]\]/);
  assert.match(dashboard, /isAdmin && dashboardPermissions\.includes\('staffAttendance'\)/);
  assert.doesNotMatch(server, /\['supervisor', 'reciter', 'admin'\]\.includes\(req\.auth\.role\) && path\.startsWith\('\/staff-attendance'\)/);
});

test('staff attendance migration is compatible with MySQL versions lacking ADD COLUMN IF NOT EXISTS', async () => {
  const existingColumns = new Set();
  const statements = [];
  const connection = {
    async query(sql, parameters = []) {
      statements.push(sql);
      if (sql.includes('information_schema.columns')) {
        return [existingColumns.has(parameters[0]) ? [{ exists: 1 }] : []];
      }
      const addedColumn = sql.match(/ADD COLUMN `([^`]+)`/u)?.[1];
      if (addedColumn) existingColumns.add(addedColumn);
      return [[]];
    },
  };

  await applyStaffAttendanceMigration(connection);
  await applyStaffAttendanceMigration(connection);

  assert.deepEqual([...existingColumns], ['check_in_method', 'distance_meters', 'asr_time']);
  assert.equal(statements.filter((sql) => sql.includes('ALTER TABLE')).length, 3);
  assert.doesNotMatch(statements.join('\n'), /ADD COLUMN IF NOT EXISTS/);
});
