import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { syncGradePoints, gradeToPoints } from '../server/services/gradePoints.js';
import { deleteDailyGrade, deleteWeeklyComponent, recordWeeklyComponent, upsertDailyGrade } from '../server/services/grading.js';
import { saveStudentAttendance } from '../server/services/studentAttendance.js';
import * as gradePointsMigration from '../server/migrations/2026.09.26.3-grade-points.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const total = (ledger) => Math.max(0, [...ledger.values()].reduce((sum, row) => sum + row.points, 0));

/** In-memory student, family and ledger that understand the SQL of the points services. */
function memoryDatabase({ points = 10, store = 4, family = 30, addToFamily = 'true' } = {}) {
  const state = { resetKeys: new Set(), points, store, family, contribution: 0, ledger: new Map(), queries: [], transactions: [] };
  const connection = {
    async query(sql, values = []) {
      const q = sql.replace(/\s+/g, ' ').trim();
      state.queries.push(q);
      if (q.includes('FROM grade_point_reset_keys')) return [[{ resetKey: state.resetKeys.has(values[0]) ? 1 : 0 }]];
      if (q.includes('FROM student_day_compensations')) return [[]];
      if (q.startsWith('SELECT policy_json AS policy FROM student_weekly_components')) return [[]];
      if (q.startsWith('SELECT id FROM students')) return [[{ id: values[0] }]];
      if (q.startsWith('SELECT id, points, transaction_date AS date FROM student_point_transactions')) {
        const row = state.ledger.get(values[0]);
        return [[...(row ? [{ id: values[0], points: row.points }] : [])]];
      }
      if (q.startsWith('DELETE FROM student_point_transactions WHERE id = ?')) { state.ledger.delete(values[0]); return [{}]; }
      if (q.startsWith('INSERT INTO student_point_transactions')) {
        const [studentId, actorRole, actorName, amount, reason, date, sourceType, dedupeKey] = values;
        state.ledger.set(dedupeKey, { studentId, actorRole, actorName, points: amount, reason, date, sourceType });
        return [{}];
      }
      if (q.startsWith('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN')) {
        return [[{ setting_key: 'studentPointsAddToFamily', setting_value: addToFamily }]];
      }
      if (q.startsWith('SELECT points, committee_id AS committeeId FROM students')) return [[{ points: state.points, committeeId: 3 }]];
      if (q.startsWith('SELECT GREATEST')) return [[{ total: total(state.ledger) + 10 }]];
      if (q.startsWith('UPDATE students SET points = ?, store_balance')) {
        state.points = values[0]; state.store = Math.round((state.store + values[1]) * 100) / 100; return [{}];
      }
      if (q.startsWith('UPDATE committees')) {
        state.family = Math.round((state.family + values[0]) * 100) / 100;
        state.contribution = Math.round((state.contribution + values[1]) * 100) / 100;
        return [{}];
      }
      if (q.startsWith('SELECT setting_value AS holidays FROM app_settings')) return [[]];
      if (q.startsWith('SELECT setting_value AS pause FROM app_settings')) return [[]];
      if (q.startsWith('SELECT state_json AS pause FROM student_plan_pauses')) return [[]];
      if (q.startsWith('SELECT setting_value AS value FROM app_settings')) return [[]];
      if (q.includes('FROM grading_week_policies')) return [[]];
      if (q.startsWith('SELECT status FROM attendance_records')) return [[]];
      if (/^(INSERT IGNORE INTO grading_week_policies|INSERT INTO student_daily_grades|DELETE FROM student_daily_grades|INSERT INTO student_weekly_components|DELETE FROM student_weekly_components|INSERT INTO attendance_records)/.test(q)) return [{}];
      throw new Error(`Unexpected query: ${q}`);
    },
    async beginTransaction() { state.transactions.push('begin'); },
    async commit() { state.transactions.push('commit'); },
    async rollback() { state.transactions.push('rollback'); },
    release() { state.transactions.push('release'); },
  };
  const pool = { query: connection.query, getConnection: async () => connection };
  return { state, connection, pool };
}

const grade = (connection, points, dedupeKey = 'grade:daily:1:2026-09-20:memorization') => syncGradePoints(connection, {
  studentId: 1, dedupeKey, points, date: '2026-09-20', reason: 'درجة الحفظ', actor: { role: 'supervisor', name: 'مشرف المسار' },
});

test('a grade earns exactly its value once, moves wallet and family together, and is removed with the grade', async () => {
  const { state, connection } = memoryDatabase();
  await grade(connection, 7.5);
  await grade(connection, 7.5);
  assert.deepEqual([state.points, state.store, state.family, state.contribution], [17.5, 11.5, 37.5, 7.5]);
  assert.deepEqual(state.ledger.get('grade:daily:1:2026-09-20:memorization'), {
    studentId: 1, actorRole: 'supervisor', actorName: 'مشرف المسار', points: 7.5, reason: 'درجة الحفظ', date: '2026-09-20', sourceType: 'grade',
  });
  await grade(connection, 0.955);
  assert.equal(state.ledger.get('grade:daily:1:2026-09-20:memorization').points, 0.96);
  assert.deepEqual([state.points, state.store], [10.96, 4.96]);
  await grade(connection, 0);
  assert.equal(state.ledger.size, 0);
  assert.deepEqual([state.points, state.store, state.family, state.contribution], [10, 4, 30, 0]);
  assert.equal(gradeToPoints(-3), 0);
});

test('family contribution follows the setting', async () => {
  const { state, connection } = memoryDatabase({ addToFamily: 'false' });
  await grade(connection, 2.25);
  assert.deepEqual([state.points, state.family], [12.25, 30]);
});

test('spending a grade then removing and restoring it cannot mint store credit', async () => {
  const { state, connection } = memoryDatabase({ store: 0 });
  await grade(connection, 1);
  state.store -= 1;
  await grade(connection, 0);
  assert.equal(state.store, -1, 'retain the correction debt instead of discarding it');
  await grade(connection, 1);
  assert.equal(state.store, 0);
  for (let retry = 0; retry < 3; retry += 1) {
    await grade(connection, 0);
    await grade(connection, 1);
  }
  assert.equal(state.store, 0);
});

test('daily grade writes and deletions carry their points inside one transaction', async () => {
  const { state, pool } = memoryDatabase();
  const policy = normalizeGradingPolicy({});
  const actor = { role: 'supervisor', id: 4, name: 'مشرف المسار' };
  await upsertDailyGrade(pool, { studentId: 1, date: '2026-09-20', result: { component: 'attendance', grade: 1.5, max: 2, passed: true }, policy, actor });
  assert.deepEqual(state.transactions, ['begin', 'commit', 'release']);
  assert.equal(state.ledger.get('grade:daily:1:2026-09-20:attendance').points, 1.5);
  assert.equal(state.ledger.get('grade:daily:1:2026-09-20:attendance').reason, 'درجة الحضور');
  assert.ok(state.queries.indexOf(state.queries.find(q => q.startsWith('INSERT INTO student_daily_grades')))
    < state.queries.indexOf(state.queries.find(q => q.startsWith('INSERT INTO student_point_transactions'))));
  await deleteDailyGrade(pool, { studentId: 1, date: '2026-09-20', component: 'attendance', actor });
  assert.equal(state.ledger.size, 0);
  assert.equal(state.points, 10);
});

test('weekly track and weekly sessions earn their grade and lose it when cleared', async () => {
  const { state, connection } = memoryDatabase();
  const result = await recordWeeklyComponent(connection, { studentId: 1, weekStart: '2026-09-20', component: 'weekly', attended: true, actor: { role: 'manager' } });
  const row = state.ledger.get('grade:weekly:1:2026-09-20:weekly');
  assert.equal(row.points, gradeToPoints(result.grade));
  assert.equal(row.reason, 'الجلسة الأسبوعية');
  assert.equal(state.transactions.length, 0, 'a caller connection keeps its own transaction');
  await deleteWeeklyComponent(connection, { studentId: 1, weekStart: '2026-09-20', component: 'weekly', actor: { role: 'manager' } });
  assert.equal(state.ledger.size, 0);
});

test('attendance stores no attendance points and earns only its attendance grade', async () => {
  const { state, connection } = memoryDatabase();
  await saveStudentAttendance(connection, { studentId: 1, date: '2026-09-20', status: 'present' }, { familyPointsAddToStudents: false });
  const attendance = state.queries.find(q => q.startsWith('INSERT INTO attendance_records'));
  assert.match(attendance, /VALUES \(\?, \?, \?, \?, 0\).*points = 0/);
  assert.deepEqual([...state.ledger.values()].map(row => row.sourceType), ['grade']);
  assert.ok(state.ledger.has('grade:daily:1:2026-09-20:attendance'));
});

test('unrecorded weekly attendance is stored as unrecorded rather than implicit absence', async () => {
  const { state, connection } = memoryDatabase();
  for (const component of ['track', 'weekly']) {
    const result = await recordWeeklyComponent(connection, { studentId: 1, weekStart: '2026-09-20', component, attendanceRecorded: false });
    assert.equal(result.attendanceStatus, null);
    assert.equal(result.attendanceRecorded, false);
    assert.equal(result.grade, 0);
  }
  assert.equal(state.ledger.size, 0);
});

test('the grade points migration widens point columns and rebuilds the ledger from recorded grades only', async () => {
  const queries = [];
  const steps = [];
  await gradePointsMigration.up({
    async query(sql, values = []) {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
      return /FROM app_settings WHERE setting_key IN/.test(sql) ? [[]] : [{}];
    },
    async beginTransaction() { steps.push('begin'); },
    async commit() { steps.push('commit'); },
    async rollback() { steps.push('rollback'); },
  });
  const sql = queries.map(query => query.sql);
  assert.equal(gradePointsMigration.version, '2026.09.26.3');
  assert.deepEqual(steps, ['begin', 'commit']);
  assert.match(sql[0], /student_point_transactions MODIFY COLUMN points DECIMAL\(10,2\)/);
  assert.match(sql[1], /students MODIFY COLUMN points DECIMAL\(12,2\).*store_balance DECIMAL\(12,2\)/);
  assert.match(sql[2], /committees MODIFY COLUMN points DECIMAL\(12,2\).*student_points_contribution DECIMAL\(12,2\)/);
  const removal = queries.find(query => query.sql.startsWith('DELETE FROM student_point_transactions'));
  for (const source of ['attendance', 'quran_plan', 'quran_execution', 'quran_evaluation', 'quran_test', 'learning_path', 'grade']) {
    assert.ok(removal.values.includes(source), source);
  }
  for (const kept of ['teacher', 'supervisor_award', 'supervisor_deduction', 'manager_adjustment', 'manual_award', 'family_evaluation', 'store_purchase']) {
    assert.equal(removal.values.includes(kept), false, kept);
  }
  const inserts = sql.filter(query => query.startsWith('INSERT INTO student_point_transactions'));
  assert.equal(inserts.length, 3);
  assert.match(inserts[0], /FROM student_daily_grades WHERE ROUND\(grade, 2\) > 0/);
  assert.match(inserts[0], /CONCAT\('grade:daily:', student_id/);
  assert.match(inserts[1], /FROM student_weekly_components WHERE ROUND\(grade, 2\) > 0/);
  assert.match(inserts[2], /CONCAT\('grade:narration:', es\.id\).*ROUND\(es\.final_score, 2\) > 0/);
  const wallet = sql.findIndex(query => query.includes('SET s.store_balance = GREATEST(0, s.store_balance + COALESCE(t.total, 0) - s.points)'));
  const balance = sql.findIndex(query => query.includes('SET s.points = COALESCE(t.total, 0)'));
  assert.ok(wallet > 0 && balance > wallet, 'the wallet moves by the change before points are replaced');
  assert.ok(sql.some(query => query.startsWith('UPDATE attendance_records SET points = 0')));
  const settings = queries.find(query => query.sql.startsWith('DELETE FROM app_settings'));
  assert.ok(settings.values.includes('pointsSystemEnabled') && settings.values.includes('platformPolicy:memorizationPoints'));
});

test('the points system has no switch and the compensation options no longer carry point percentages', async () => {
  const [settingsSection, server, catalog] = await Promise.all([
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../server/index.js'),
    read('../shared/platform-settings-catalog.js'),
  ]);
  assert.doesNotMatch(settingsSection, /نظام النقاط|pointsSystemEnabled|recitationPointsFields|InlineToggleNumberSetting\s+label="(تعويض الحفظ المتأخر|تجاوز مقدار اليوم)/);
  assert.match(settingsSection, /<SettingToggle\s+label="تعويض الحفظ المتأخر"/);
  assert.match(settingsSection, /<SettingToggle\s+label="تجاوز مقدار اليوم والتقدم في الخطة"/);
  assert.match(settingsSection, /label="السماح لمشرف المسار بالإضافة والخصم"/);
  assert.doesNotMatch(catalog, /pointsSystemEnabled/);
  assert.match(server, /function publicSettingsForClient[\s\S]*pointsSystemEnabled: true,/);
  assert.doesNotMatch(server, /pointsSystemEnabled: (parseBoolean|Boolean|settings)|settings\.pointsSystemEnabled/);
});


test('a reset grade cannot reappear after editing, clearing or re-recording it in the same week', async () => {
  const { state, connection } = memoryDatabase();
  const key = 'grade:weekly:1:2026-09-20:weekly';
  state.resetKeys.add(key);
  for (const amount of [20, 0, 15, 20]) await grade(connection, amount, key);
  assert.equal(state.ledger.size, 0);
  assert.equal(state.store, 4);
  await grade(connection, 2, 'grade:daily:1:2026-09-20:reading');
  assert.equal(state.store, 6, 'an unreset grade can still earn points');
});
