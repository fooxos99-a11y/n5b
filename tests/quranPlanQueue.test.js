import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateQueuedPlanRanges } from '../server/services/quranPlanQueue.js';
import { remainingPlanFaces, forecastQuranPlan } from '../server/services/quranPlanForecast.js';
import { assertPlanDailyThreshold } from '../server/services/planDailyThreshold.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

const range = (startSurah, startAyah, endSurah, endAyah) => ({ startSurah, startAyah, endSurah, endAyah });
test('queued plans validate independent Quran ranges and reject invalid or overlapping ranges', async () => {
  const dependencies = { resolve: async value => value?.startSurah ? value : null, expand: async value => [value] };
  const current = range(1, 1, 1, 7), next = range(2, 1, 2, 20), later = range(3, 1, 3, 20);
  assert.deepEqual(await validateQueuedPlanRanges([next, later], current, dependencies), [next, later]);
  for (const input of [null, [{}], [current], [next, next], [range(1, 7, 2, 20)]]) {
    await assert.rejects(validateQueuedPlanRanges(input, current, dependencies), { statusCode: 422 });
  }
  assert.deepEqual(await validateQueuedPlanRanges([range(2, 21, 2, 40)], next, dependencies), [range(2, 21, 2, 40)]);
});

test('face forecast subtracts accepted ranges once and respects completion and partial faces', () => {
  const plan = range(1, 1, 1, 7);
  assert.equal(remainingPlanFaces(plan, []), 0.5);
  assert.equal(remainingPlanFaces(plan, [plan, plan]), 0);
  const partial = remainingPlanFaces(plan, [range(1, 1, 1, 3)]);
  assert.ok(partial > 0 && partial < 1);
  const descending = range(114, 1, 112, 4);
  assert.equal(remainingPlanFaces(descending, [range(114, 1, 114, 6), range(113, 1, 113, 5), range(112, 1, 112, 4)]), 0);
});

test('forecast adjusts its date to remaining faces and skips non-execution days', async () => {
  const connection = { query: async () => [[]] };
  const base = { plan: { ...range(1, 1, 1, 7), dailyPages: 0.25, startDate: '2026-10-01' }, today: '2026-10-01', workDays: [0, 1, 2, 3, 4] };
  const full = await forecastQuranPlan(connection, { ...base, acceptedRanges: [] });
  assert.equal(full.projectedEndDate, '2026-10-05');
  const partial = await forecastQuranPlan(connection, { ...base, acceptedRanges: [range(1, 1, 1, 3)] });
  assert.ok(partial.projectedEndDate < full.projectedEndDate);
  assert.equal((await forecastQuranPlan(connection, { ...base, acceptedRanges: [base.plan] })).projectedEndDate, base.today);
});

test('a daily amount needs its corresponding failure threshold', () => {
  const policy = normalizeGradingPolicy();
  assertPlanDailyThreshold(policy, 1);
  assertPlanDailyThreshold(policy, 1.25);
  assert.throws(() => assertPlanDailyThreshold(policy, 3), { statusCode: 422 });
  policy.weeklyProgram.memorizationThresholds.push({ faces: 3, threshold: 0.9 });
  assertPlanDailyThreshold(policy, 3);
});

const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
function loadFunction(name, dependencies) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf('\n}', start) + 2;
  const context = vm.createContext(dependencies);
  vm.runInContext(source.slice(start, end), context);
  return context[name];
}
test('mastery cursor uses only that plan execution, while memorization includes earlier accepted work', async () => {
  const calls = [];
  const resolve = loadFunction('getNextUnmemorizedPlanPosition', {
    loadCompensatedPlanRanges: async () => [], getSaudiDateTimeParts: () => ({ date: '2026-10-02' }),
    Number, getQuranRangeDirection: () => 1, getQuranAyahsInPageRange: async () => [{}],
    getStudentMemorizedRanges: async () => { calls.push('saved'); return []; },
    getCompletedMemorizationRanges: async (_db, filters) => { calls.push(filters); return []; },
    findNextUnmemorizedPosition: () => ({ page: 1 }),
  });
  await resolve({}, { ...range(1, 1, 1, 7), startPage: 1, endPage: 1, id: 17, studentId: 3, track: 'mastery' }, { approvedOnly: true });
  assert.equal(calls[0].planId, 17); assert.equal(calls[0].approvedOnly, true);
  await resolve({}, { ...range(1, 1, 1, 7), startPage: 1, endPage: 1, track: 'memorization' });
  assert.equal(calls[1], 'saved');
});

test('automatic transition waits for teacher approval and advances exactly when nothing remains', async () => {
  for (const [pending, expected] of [[true, 0], [false, 1]]) {
    let transitions = 0;
    const recompute = loadFunction('recomputePlanMemorizationCursor', {
      Number, getQuranRangeDirection: () => 1,
      getNextUnmemorizedPlanPosition: async (_db, _plan, filters) => filters?.approvedOnly && pending ? { page: 1 } : null,
      activateQueuedQuranPlan: async () => { transitions++; },
      getSaudiDateTimeParts: () => ({ date: '2026-10-01' }), addUtcDays: () => '2026-10-02',
    });
    await recompute({ query: async () => {} }, { startPage: 1, endPage: 1 });
    assert.equal(transitions, expected);
  }
});

test('manual close denies a teacher outside their circles before reading or changing any plan', async () => {
  const start = source.indexOf("app.post('/api/student-plans/:studentId/close'");
  const end = source.indexOf("app.delete('/api/student-plans/:studentId'", start);
  let handler, released = false, code;
  vm.runInNewContext(source.slice(start, end), {
    app: { post: (_path, _guard, callback) => { handler = callback; } }, requireStudentPlanAccess: () => {},
    db: () => ({ getConnection: async () => ({ release() { released = true; }, query: async () => { throw new Error('Unauthorized read'); } }) }),
    hasSupervisorStudentPlanAccess: async () => false,
  });
  await handler({ auth: { role: 'supervisor' }, params: { studentId: '3' } }, { status(value) { code = value; return this; }, json() {} }, error => { throw error; });
  assert.equal(code, 403); assert.equal(released, true);
});

test('manual close preserves a changed plan and commits only an available successor', async () => {
  const start = source.indexOf("app.post('/api/student-plans/:studentId/close'");
  const end = source.indexOf("app.delete('/api/student-plans/:studentId'", start);
  for (const [requestedId, successor, expectedCode] of [[16, 18, 409], [17, null, 422], [17, 18, 200]]) {
    let handler, code = 200, committed = false, rolledBack = false, released = false, transitions = 0;
    const connection = {
      beginTransaction: async () => {}, query: async () => [[{ id: 3 }]],
      commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; },
      release() { released = true; },
    };
    vm.runInNewContext(source.slice(start, end), {
      app: { post: (_path, _guard, callback) => { handler = callback; } }, requireStudentPlanAccess: () => {},
      db: () => ({ getConnection: async () => connection }), hasSupervisorStudentPlanAccess: async () => true,
      getActivePlanForStudent: async () => ({ id: 17 }),
      getSaudiDateTimeParts: () => ({ date: '2026-10-01' }), addUtcDays: () => '2026-10-02',
      activateQueuedQuranPlan: async (_connection, options) => {
        transitions++; assert.equal(options.planId, 17); assert.equal(options.manual, true);
        assert.equal(options.startDate, '2026-10-02'); return successor;
      },
    });
    await handler({ auth: { role: 'supervisor' }, params: { studentId: '3' }, body: { planId: requestedId } },
      { status(value) { code = value; return this; }, json() {} }, error => { throw error; });
    assert.equal(code, expectedCode); assert.equal(committed, expectedCode === 200);
    assert.equal(rolledBack, expectedCode !== 200); assert.equal(released, true);
    assert.equal(transitions, expectedCode === 409 ? 0 : 1);
  }
});
