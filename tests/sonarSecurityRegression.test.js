import { gradingPermissionForComponent } from '../shared/dashboard-permissions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

/** Evaluate a top-level pure helper without starting the application or connecting to a database. */
function loadHelper(name, dependencies = {}) {
  const start = server.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing helper ${name}`);
  const end = server.indexOf('\n}', start) + 2;
  const context = vm.createContext({ gradingPermissionForComponent, ...dependencies });
  vm.runInContext(server.slice(start, end), context);
  return context[name];
}

test('specific API permissions take precedence over broad student and report routes', () => {
  const resolve = loadHelper('getDashboardPermissionKeysForRequest');
  const cases = [
    ['/api/nazem/accounts', 'GET', []],
    ['/api/students/42/attendance', 'POST', ['manualAttendance']],
    ['/api/students/42/points/award', 'POST', ['students']],
    ['/api/students', 'GET', ['students', 'reports', 'whatsappSend', 'manualAttendance']],
    ['/api/students', 'POST', ['students']],
    ['/api/supervisors/7/quran-evaluation/10', 'POST', ['quranEvaluation']],
    ['/api/reports/students', 'GET', ['reports', 'manualAttendance']],
    ['/api/reports/overview', 'GET', ['reports']],
    ['/api/unknown', 'GET', []],
  ];
  for (const [path, method, expected] of cases) {
    assert.deepEqual(Array.from(resolve({ path, method })), expected, `${method} ${path}`);
  }
});

test('batched execution preserves partial, complete, extra and reversed traversal boundaries', () => {
  const update = loadHelper('getTaskExecutionUpdate', {
    taskStartPosition: (task) => ({ page: task.fromPage, surah: 2, ayah: task.fromAyah }),
    taskEndPosition: (task) => ({ page: task.toPage, surah: 2, ayah: task.toAyah }),
    compareQuranPositionInDirection: (a, b, direction) => ((a.page - b.page) || (a.ayah - b.ayah)) * direction,
  });
  for (const direction of [1, -1]) {
    const task = { id: 1, taskType: 'memorization', fromPage: 2, toPage: 2,
      fromAyah: direction === 1 ? 10 : 20, toAyah: direction === 1 ? 20 : 10 };
    const end = { page: 2, surah: 2, ayah: task.toAyah };
    const context = { status: 'done', lastTaskIdByType: new Map([['memorization', 1]]),
      executionDirection: direction, expectedEnd: end };
    for (const [ayah, status, state, actual] of [
      [task.fromAyah - direction, 'not_done', 'partial', null],
      [15, 'done', 'partial', 15],
      [task.toAyah, 'done', 'complete', task.toAyah],
      [task.toAyah + direction, 'done', 'extra', task.toAyah + direction],
    ]) {
      const result = update(task, { ...context, actualEnd: { page: 2, surah: 2, ayah } });
      assert.equal(result.status, status);
      assert.equal(result.executionState, state);
      assert.equal(result.ayah, actual);
    }
    const undone = update(task, { ...context, status: 'not_done', actualEnd: null });
    assert.equal(undone.executionState, null);
    assert.equal(undone.page, null);
    const earlierTask = update({ ...task, id: 2 }, { ...context, actualEnd: { ...end, ayah: task.toAyah + direction } });
    assert.equal(earlierTask.ayah, task.toAyah, 'only the last task may extend beyond its end');
  }
});

test('the global API gate permits student news reads but blocks management and writes', async () => {
  const start = server.indexOf('async function authorizeApiRequest(');
  const end = server.indexOf('\n}', start) + 2;
  const context = vm.createContext({
    getSharedApiAccess: () => ({}), getOwnAccountDeletionAccess: () => false,
    getSupervisorApiAccess: () => ({}), getStudentFeatureApiAccess: () => ({}),
    hasOfflineRecitationAccountAccess: () => false, canAccessDashboardApi: async () => false,
  });
  vm.runInContext(server.slice(start, end), context);
  for (const [path, method, expected] of [['/api/student-news', 'GET', 200], ['/api/student-news/manage', 'GET', 403], ['/api/student-news/audience', 'GET', 403], ['/api/student-news', 'PUT', 403]]) {
    let status = 0;
    const res = { status(code) { status = code; return this; }, json() {} };
    await context.authorizeApiRequest({ path, method, auth: { role: 'student', id: 244 } }, res, error => { if (error) throw error; status = 200; });
    assert.equal(status, expected, `${method} ${path}`);
  }
  const resolve = loadHelper('getDashboardPermissionKeysForRequest');
  for (const path of ['/api/student-news/manage', '/api/student-news/audience']) assert.deepEqual(Array.from(resolve({ path, method: 'GET' })), ['settings']);
});
