import { uncompensatedTaskSql } from '../server/services/compensationPlanCredit.js';
import { studyDateSql } from '../server/services/seasonalHolidays.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { compareQuranPositionInDirection } from '../shared/quran-execution-policy.js';
import { findNextUnmemorizedPosition } from '../server/services/quranMemorizationContinuity.js';

const position = (page, ayah, surah = 2) => ({ page, ayah, surah });
const range = (start, end) => ({
  startPage: start.page, startSurah: start.surah, startAyah: start.ayah,
  endPage: end.page, endSurah: end.surah, endAyah: end.ayah,
});
const ayahs = [
  position(21, 140), position(21, 141),
  position(22, 142), position(22, 143), position(22, 144), position(22, 145),
  position(23, 146), position(23, 147),
];
const options = { ayahs, start: ayahs[0], end: ayahs.at(-1) };

test('page 22 remains next when completed memorization jumps from page 21 to 23', () => {
  assert.deepEqual(findNextUnmemorizedPosition({
    ...options, ranges: [range(ayahs[0], ayahs[1]), range(ayahs[6], ayahs[7])],
  }), position(22, 142));
});

test('a missing ayah inside a partially completed face cannot be skipped', () => {
  assert.deepEqual(findNextUnmemorizedPosition({
    ...options, ranges: [range(ayahs[0], ayahs[3]), range(ayahs[5], ayahs[7])],
  }), position(22, 144));
});

test('filling the gap completes the plan without dropping later accepted memorization', () => {
  assert.equal(findNextUnmemorizedPosition({
    ...options, ranges: [range(ayahs[0], ayahs[1]), range(ayahs[2], ayahs[5]), range(ayahs[6], ayahs[7])],
  }), null);
});

test('prior memorization and overlapping accepted ranges are covered without double advancement', () => {
  assert.deepEqual(findNextUnmemorizedPosition({
    ...options, ranges: [range(ayahs[0], ayahs[3]), range(ayahs[2], ayahs[5])],
  }), position(23, 146));
});

test('no accepted memorization starts at the plan boundary, even within a page', () => {
  assert.deepEqual(findNextUnmemorizedPosition({ ...options, start: ayahs[3], ranges: [] }), ayahs[3]);
});

test('reverse plans traverse surahs backwards and ayahs forwards, including boundary pages', () => {
  const reverseAyahs = [position(599, 1, 98), position(599, 2, 98), position(600, 1, 99), position(600, 2, 99)];
  assert.deepEqual(findNextUnmemorizedPosition({
    ayahs: reverseAyahs,
    start: reverseAyahs[2], end: reverseAyahs[1], direction: -1,
    ranges: [range(reverseAyahs[2], reverseAyahs[3]), range(reverseAyahs[1], reverseAyahs[1])],
  }), reverseAyahs[0]);
});

test('cursor update after execution and administrative correction writes the first gap and keeps plan active', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = server.slice(
    server.indexOf('async function recomputePlanMemorizationCursor('),
    server.indexOf('async function buildExecutionSegmentDetails('),
  );
  const context = vm.createContext({
    studyDateSql, uncompensatedTaskSql,
    getQuranRangeDirection: () => 1,
    getNextUnmemorizedPlanPosition: async () => findNextUnmemorizedPosition({
      ...options, ranges: [range(ayahs[0], ayahs[1]), range(ayahs[6], ayahs[7])],
    }),
  });
  vm.runInContext(implementation, context);
  const writes = [];
  await context.recomputePlanMemorizationCursor({ query: async (sql, args) => { writes.push({ sql, args }); } }, {
    id: 21, startPage: 21, startSurah: 2, startAyah: 140, endPage: 23, endSurah: 2, endAyah: 147,
  });
  assert.equal(writes.length, 1);
  assert.deepEqual(Array.from(writes[0].args), [22, 2, 142, 22, 21]);
  assert.match(writes[0].sql, /WHEN status = 'completed' THEN 'active'/);
});

test('student and teacher execution cannot advance beyond a remaining gap', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = server.slice(
    server.indexOf('async function updatePlanCursorAfterExecution('),
    server.indexOf('async function recomputePlanMemorizationCursor('),
  );
  const context = vm.createContext({
    studyDateSql, uncompensatedTaskSql,
    getQuranRangeDirection: () => 1,
    compareQuranPositionInDirection,
    recomputePlanMemorizationCursor: async () => position(22, 142),
  });
  vm.runInContext(implementation, context);
  await assert.rejects(context.updatePlanCursorAfterExecution({}, {
    id: 21, startPage: 21, startSurah: 2, startAyah: 140, endPage: 23, endSurah: 2, endAyah: 147,
  }, 'memorization', position(23, 147)), (error) => error.statusCode === 409 && /22.*142/.test(error.message));
  await context.updatePlanCursorAfterExecution({}, {
    id: 21, startPage: 21, startSurah: 2, startAyah: 140, endPage: 23, endSurah: 2, endAyah: 147,
  }, 'memorization', position(21, 141));
});

test('single-task endpoint uses the same validation and cannot override its task id', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = server.slice(
    server.indexOf("app.post('/api/students/:id/quran-tasks/:taskId/execution'"),
    server.indexOf('const shareTeacherPreparation = createSharedPreparation();'),
  );
  let handler;
  let payload;
  vm.runInNewContext(implementation, {
    app: { post: (_path, callback) => { handler = callback; } },
    executeStudentQuranTasks: async (req) => { payload = req.body; },
  });
  await handler({ params: { taskId: '7' }, body: { status: 'done', taskIds: [99] } }, {}, () => {});
  assert.deepEqual(Array.from(payload.taskIds), ['7']);
  assert.equal(payload.status, 'done');
});

test('pending tasks beyond a gap are repaired, while evaluated tasks are preserved', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = server.slice(
    server.indexOf('async function repairUnevaluatedMemorizationTaskRange('),
    server.indexOf('async function ensureStudentPlanTasks('),
  );
  const context = vm.createContext({
    studyDateSql, uncompensatedTaskSql,
    getQuranRangeDirection: () => 1,
    compareQuranPositionInDirection,
    getPlanProgressContext: async () => ({ normalEnd: position(23, 147) }),
  });
  vm.runInContext(implementation, context);
  for (const evaluated of [false, true]) {
    const queries = [];
    const connection = { query: async (sql) => {
      queries.push(sql);
      return [[{ taskType: 'memorization', fromPage: 23, fromSurah: 2, fromAyah: 146,
        toPage: 23, toSurah: 2, toAyah: 147, teacherCompleted: evaluated ? 1 : null,
        studentStatus: evaluated ? 'done' : 'pending', hasAttempt: evaluated ? 1 : 0 }]];
    } };
    assert.equal(await context.repairUnevaluatedMemorizationTaskRange(connection, { id: 21 }, '2026-09-05', {}, position(22, 142)), !evaluated);
    assert.equal(queries.some((sql) => /DELETE/.test(sql)), !evaluated);
  }
});
