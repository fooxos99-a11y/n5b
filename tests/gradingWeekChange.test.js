import assert from 'node:assert/strict';
import test from 'node:test';
import { changeCurrentGradingWeek } from '../shared/grading-week-change.js';
import { gradingMaxima, gradingPolicyForDate, normalizeGradingPolicy, parseGradingPolicy, workDateOverridesFromPolicies } from '../shared/grading-policy.js';
import { computeWeeklyGrade } from '../shared/grading-engine.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';
import { saveGradingPolicyChange, loadGradingPolicyChange } from '../server/services/gradingPolicyChanges.js';

const weekStart = '2026-10-11', today = '2026-10-17';
const previous = normalizeGradingPolicy();
const desired = normalizeGradingPolicy({ ...previous, generalMargin: 16, weeklyProgram: { ...previous.weeklyProgram, workDays: [0, 1, 2, 3, 4, 6] } });
const change = options => changeCurrentGradingWeek({ previous, desired, weekStart, today, ...options });
const dates = Array.from({ length: 7 }, (_, weekday) => ({ date: `2026-10-${11 + weekday}`, weekday, planActive: true,
  attendance: { grade: 1 }, memorization: { grade: 1, scheduled: true }, link: { grade: 1, scheduled: true }, review: { grade: 1, scheduled: true }, reading: { grade: 1 } }));

test('adding Saturday today creates a work date while keeping Friday off and past policies exact', () => {
  const policy = change();
  assert.deepEqual(gradingPolicyForDate(policy, '2026-10-12'), previous);
  const overrides = workDateOverridesFromPolicies([{ weekStart, policy }]);
  assert.equal(overrides[today], true);
  assert.equal(overrides['2026-10-16'], false);
  assert.equal(gradingMaxima(policy).total, 100);
  const result = computeWeeklyGrade(policy, { days: dates, today, track: { grade: 30 }, weekly: { grade: 20 } });
  assert.equal(result.days[1].components.memorization.grade, 1);
  assert.equal(result.days[6].components.memorization.max, 1);
  assert.equal(result.total, 100);
  assert.equal(result.max, 100);
  assert.deepEqual(parseGradingPolicy(JSON.stringify(policy)), policy);
});

test('recorded self reading does not block adding a recitation day', () => {
  const next = normalizeGradingPolicy({ ...desired, weeklyProgram: { ...desired.weeklyProgram, readingDaily: 0.5 } });
  const policy = change({ desired: next, lockedReading: true });
  assert.equal(gradingPolicyForDate(policy, today).weeklyProgram.readingDaily, 1);
  assert.equal(gradingPolicyForDate(policy, today).weeklyProgram.workDays.includes(6), true);
});

test('already recorded recitation keeps its date, amounts and deductions when a day is removed', () => {
  const old = normalizeGradingPolicy({ ...previous, weeklyProgram: { ...previous.weeklyProgram, workDays: [0, 1, 2, 3, 6] } });
  const policy = change({ previous: old, desired: previous, lockedCore: true });
  assert.deepEqual(gradingPolicyForDate(policy, today).weeklyProgram.attendance, old.weeklyProgram.attendance);
  assert.equal(gradingPolicyForDate(policy, today).weeklyProgram.workDays.includes(6), true);
  assert.equal(gradingPolicyForDate(policy, today).weeklyProgram.memorizationDaily, 1);
});

test('only future unrecorded amounts scale when frozen history leaves insufficient room', () => {
  const old = normalizeGradingPolicy({ ...previous, generalMargin: 0, weeklyProgram: { ...previous.weeklyProgram, margin: 0, memorizationDaily: 5 } });
  const next = normalizeGradingPolicy({ ...old, weeklyProgram: { ...old.weeklyProgram, workDays: [0, 1, 2, 3, 4, 6], memorizationDaily: 5 } });
  const policy = change({ previous: old, desired: next });
  assert.deepEqual(gradingPolicyForDate(policy, '2026-10-12'), old);
  assert.ok(gradingMaxima(policy).total <= 100);
  const p = gradingPolicyForDate(policy, today).weeklyProgram;
  assert.ok(p.memorizationDaily < 5);
  assert.ok(Math.abs(p.memorizationDaily / p.linkDaily - 5) < 0.002);
});

test('sequential midweek changes never rewrite an earlier policy date', () => {
  const first = change({ today: '2026-10-14' });
  const second = change({ previous: first, desired: previous, today: '2026-10-16' });
  assert.deepEqual(gradingPolicyForDate(first, '2026-10-15'), gradingPolicyForDate(second, '2026-10-15'));
  assert.equal(gradingPolicyForDate(second, today).weeklyProgram.workDays.includes(6), false);
});

test('plan progression uses effective date policies and continues excluding seasonal holidays', async () => {
  const policy = change();
  const connection = { query: async sql => sql.includes('grading_week_policies') ? [[{ weekStart, policy }]]
    : sql.includes('seasonalHolidays') || sql.includes('SELECT setting_value AS holidays') ? [[{ holidays: JSON.stringify([{ id: 'holiday', startDate: '2026-10-12', endDate: '2026-10-12' }]) }]] : [[]] };
  const planned = await planScheduleDates(connection, weekStart, today, previous.weeklyProgram.workDays);
  assert.ok(planned.includes(today));
  assert.ok(!planned.includes('2026-10-16'));
  assert.ok(!planned.includes('2026-10-12'));
});

function database() {
  const settings = new Map([['gradingPolicy', JSON.stringify(previous)]]), weeks = new Map();
  let backup;
  const connection = {
    async beginTransaction() { backup = [new Map(settings), new Map(weeks)]; },
    async commit() {}, async rollback() { settings.clear(); weeks.clear(); backup[0].forEach((v, k) => settings.set(k, v)); backup[1].forEach((v, k) => weeks.set(k, v)); }, release() {},
    async query(sql, args = []) {
      if (sql.startsWith('SELECT setting_key')) return [[...settings].map(([settingKey, value]) => ({ settingKey, value }))];
      if (sql.startsWith('SELECT policy_json')) return [weeks.has(args[0]) ? [{ policy: weeks.get(args[0]) }] : []];
      if (sql.includes('MIN(startDate)')) return [[{ firstDate: null }]];
      if (sql.startsWith('INSERT IGNORE INTO grading_week_policies')) { if (!weeks.has(args[0])) weeks.set(args[0], args[1]); return [{}]; }
      if (sql.startsWith('UPDATE grading_week_policies')) { weeks.set(args[1], args[0]); return [{}]; }
      if (sql.startsWith('INSERT INTO app_settings')) { settings.set(args[0], args[1]); return [{}]; }
      if (sql.startsWith('SELECT DISTINCT component') || sql.includes('SELECT t.id FROM student_quran_tasks')) return [[]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  return { connection, getConnection: async () => connection, weeks, settings };
}

test('next-week save freezes this week and stale edits roll back without losing the current settings', async () => {
  const db = database();
  const initial = await loadGradingPolicyChange(db.connection, today);
  const saved = await saveGradingPolicyChange(db, { policy: desired, applyFrom: 'nextWeek', revision: initial.revision, today });
  assert.equal(saved.effectiveFrom, '2026-10-18');
  assert.deepEqual(parseGradingPolicy(db.weeks.get(weekStart)), previous);
  await assert.rejects(saveGradingPolicyChange(db, { policy: previous, applyFrom: 'today', revision: initial.revision, today }), { status: 409 });
  assert.deepEqual(parseGradingPolicy(db.settings.get('gradingPolicy')), desired);
  const immediate = await saveGradingPolicyChange(db, { policy: desired, applyFrom: 'today', revision: saved.revision, today });
  assert.equal(immediate.effectiveFrom, today);
  assert.equal(gradingPolicyForDate(parseGradingPolicy(db.weeks.get(weekStart)), today).weeklyProgram.workDays.includes(6), true);
});

test('invalid timing or excessive totals fail without persisting either setting or week', async () => {
  const db = database();
  const { revision } = await loadGradingPolicyChange(db.connection, today);
  await assert.rejects(saveGradingPolicyChange(db, { policy: desired, applyFrom: 'yesterday', revision, today }), { status: 422 });
  await assert.rejects(saveGradingPolicyChange(db, { policy: { ...desired, generalMargin: 500 }, applyFrom: 'today', revision, today }), { status: 422 });
  assert.equal(db.weeks.size, 0);
  assert.deepEqual(parseGradingPolicy(db.settings.get('gradingPolicy')), previous);
});

test('installed older clients remain compatible and defer schedule changes; explicit immediate edits need a revision', async () => {
  const db = database();
  const saved = await saveGradingPolicyChange(db, { policy: desired, today });
  assert.equal(saved.effectiveFrom, '2026-10-18');
  assert.deepEqual(parseGradingPolicy(db.weeks.get(weekStart)), previous);
  await assert.rejects(saveGradingPolicyChange(db, { policy: previous, applyFrom: 'today', today }), { status: 409 });
});

test('client-supplied date snapshots cannot replace the server historical policies', async () => {
  const db = database();
  const { revision } = await loadGradingPolicyChange(db.connection, today);
  const malicious = { ...desired, weekStart, dayPolicies: { '2026-10-12': { weeklyProgram: { memorizationDaily: 999 } } } };
  await saveGradingPolicyChange(db, { policy: malicious, applyFrom: 'today', revision, today });
  const saved = parseGradingPolicy(db.weeks.get(weekStart));
  assert.deepEqual(gradingPolicyForDate(saved, '2026-10-12'), previous);
  assert.equal(parseGradingPolicy(db.settings.get('gradingPolicy')).dayPolicies, undefined);
});
