import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStaffAttendanceReport, staffReportPeriod } from '../server/services/staffAttendanceReport.js';
import { getTaskSummary, formatReportFaces, sumReportFaces } from '../shared/report-faces.js';
import { groupUserSections } from '../src/lib/userSections.js';
import ExcelJS from 'exceljs';
import { buildSupervisorExcel } from '../server/services/reportExportBuilders.js';

test('user grouping cannot grant absent roles and preserves surrounding navigation', () => {
  const allowed = [{ key: 'reports' }, { key: 'students', label: 'الطلاب' }, { key: 'store' }, { key: 'administrators', label: 'الإداريين' }];
  const grouped = groupUserSections(allowed);
  assert.deepEqual(grouped.map(({ key }) => key), ['reports', 'users', 'store']);
  assert.deepEqual(grouped[1].userTabs.map(({ key }) => key), ['students', 'administrators']);
  assert.deepEqual(groupUserSections([{ key: 'reports' }]), [{ key: 'reports' }]);
  assert.equal(allowed[1].key, 'students');
});

test('report amounts retain actual fractions and never substitute planned targets', () => {
  assert.equal(sumReportFaces([{ actualFaces: 0.25, targetPages: 20 }, { actualFaces: 0.25 }]), 0.5);
  assert.equal(sumReportFaces([{ targetPages: 20 }]), null);
  assert.equal(sumReportFaces([{ actualFaces: 0 }]), 0);
  assert.equal(formatReportFaces(0.5), 'نصف وجه');
  assert.equal(formatReportFaces(0), 'لم يُنجز');
  assert.equal(formatReportFaces(null), 'لا توجد بيانات');
});

test('report totals include accepted tasks only and isolate track and date', () => {
  const row = { tasks: { memorization: { details: [
    { date: '2026-09-22', items: [
      { actualFaces: 0.5, teacherCompleted: true },
      { actualFaces: 5, teacherCompleted: false },
      { actualFaces: 2, teacherCompleted: true, track: 'mastery' },
    ] },
    { date: '2026-09-23', items: [{ actualFaces: 1, teacherCompleted: null, studentStatus: 'done', executionState: 'complete' }] },
  ] } } };
  assert.equal(getTaskSummary(row, 'memorization', false, null, 'memorization').faces, 1.5);
  assert.equal(getTaskSummary(row, 'memorization', true, { from: '2026-09-22' }, 'memorization').faces, 0.5);
  assert.equal(getTaskSummary(row, 'memorization', true, { from: '2026-09-23' }, 'mastery').hasItems, false);
  assert.equal(getTaskSummary(row, 'review', false).faces, null);
});

test('staff period validates dates, reversed and excessive ranges and parameter IDs', () => {
  for (const query of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-09-23', to: '2026-09-22' },
    { from: '2024-01-01', to: '2026-01-01' },
    { staffId: '1 OR 1=1' },
  ]) assert.throws(() => staffReportPeriod(query, '2026-09-23'), { status: 422 });
  assert.equal(staffReportPeriod({ from: '2024-02-28', to: '2024-03-01' }, '2026-09-23').days, 3);
});

test('staff range binds a selected person and marks missing days unrecorded without copying attendance', async () => {
  let parameters;
  const connection = { query: async (sql, params) => {
    assert.match(sql, /s\.id = \?/);
    parameters = params;
    return [[{ id: 7, name: 'معلم', status: 'late', checkInTime: '16:00', recordDate: '2026-09-22' }]];
  } };
  const report = await loadStaffAttendanceReport({ from: '2026-09-21', to: '2026-09-23', staffId: '7' }, connection, '2026-09-23');
  assert.deepEqual(parameters, ['2026-09-21', '2026-09-23', '7']);
  assert.deepEqual(report.rows.map(({ status }) => status), ['unrecorded', 'late', 'unrecorded']);
  assert.equal(report.rows[0].checkInTime, null);
  assert.equal('points' in report.rows[0], false);
});

test('manual attendance clients retain legacy null status for a missing daily record', async () => {
  const connection = { query: async () => [[{ id: 7, status: null, recordDate: null }]] };
  const report = await loadStaffAttendanceReport({ date: '2026-09-23' }, connection, '2026-09-23');
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].status, null);
});

test('staff Excel retains individual dates and unrecorded state across a period', async () => {
  const buffer = await buildSupervisorExcel({
    period: { from: '2026-09-21', to: '2026-09-22' },
    rows: [
      { id: 7, name: 'معلم اختبار', recordDate: '2026-09-21', status: 'unrecorded' },
      { id: 7, name: 'معلم اختبار', recordDate: '2026-09-22', status: 'late', checkInTime: '16:20' },
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const values = [];
  workbook.worksheets[0].eachRow(row => values.push(row.values));
  const data = values.filter(row => row[1] === 'معلم اختبار');
  assert.equal(data.length, 2);
  assert.deepEqual(data.map(row => [row[4], row[6]]), [['لم يُرصد', '2026-09-21'], ['متأخر', '2026-09-22']]);
  assert.ok(values.some(row => row.includes('تقرير الكادر')));
});
