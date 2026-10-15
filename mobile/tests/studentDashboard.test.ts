import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStudentLevel, decodeStudentNews, decodeStudentOverview, decodeStudentRange, decodeStudentSaved,
  decodeStudentToday, studentDashboardError, studentDate, studentExecutionEligible, studentPlanWeeks, studentRangeLabel,
  studentTaskResult, studentTodayGroups } from '../src/domain/studentDashboard';
import { createNativeSession, type NativeSession, type SessionStorage } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeApiErrorCode, type NativeFetch } from '../src/services/nativeApi';
import { createStudentDashboardApi } from '../src/services/studentDashboardApi';

const id = 7; const date = '2026-10-14'; const weekStart = '2026-10-11';
const identity: NativeSession = { role: 'student', id, name: 'طالب اختبار', dashboardPermissions: [],
  complex: { registrationNumber: 'native-fixture', name: 'جهة اختبار' } };
const token = 'a'.repeat(64);
const task = (overrides: Record<string, unknown> = {}) => ({ id: 1, studentId: id, planId: 2, taskDate: date,
  taskType: 'memorization', track: 'memorization', fromPage: 1, toPage: 2, fromSurah: 1, fromAyah: 1,
  toSurah: 2, toAyah: 5, fromSurahName: 'الفاتحة', toSurahName: 'البقرة',
  teacherCompleted: null, studentStatus: 'not_done', ...overrides });
const todayBody = (overrides: Record<string, unknown> = {}) => ({ date, tasks: [], todayAmounts: [task()],
  plan: { studentId: id, track: 'memorization', progressPercent: 25, projectedEndDate: '2026-12-01' },
  executionSources: { memorization: 'teacher', review: 'teacher', link: 'teacher', repeat: 'teacher' }, ...overrides });
const gradeBody = (overrides: Record<string, unknown> = {}) => ({ studentId: id, weekStart, weekEnd: '2026-10-17',
  total: 61.5, max: 100, weeklyProgram: { grade: 40, max: 65 },
  trackSession: { grade: 14.5, max: 20, recorded: true }, weeklySession: { grade: 7, max: 10, recorded: false },
  policy: { trackSession: { sessionDay: 2 }, weeklySession: { sessionDay: 5 } }, records: {}, ...overrides });
const overviewBody = (overrides: Record<string, unknown> = {}) => ({ rows: [task()],
  points: { total: 125.5, days: [{ date, earned: 4.5, additionalEarned: -2, pending: false,
    details: [{ label: 'نقاط التقييم', earned: 4.5 }], additionalDetails: [{ label: 'خصم', earned: -2 }] }] },
  weeklyGrades: [gradeBody()], ...overrides });
const code = (expected: NativeApiErrorCode) => (error: unknown) => error instanceof NativeApiError && error.code === expected;
const invalid = (callback: () => unknown) => assert.throws(callback, code('invalid-response'));

test('decoders preserve authoritative signed points and weekly totals without adding margins twice', () => {
  const overview = decodeStudentOverview(overviewBody(), id);
  assert.equal(overview.points.total, 125.5); assert.equal(overview.points.days[0]?.additionalEarned, -2);
  assert.deepEqual(overview.points.days[0]?.additionalDetails, [{ label: 'خصم', earned: -2 }]);
  assert.equal(overview.weeklyGrades[0]?.total, 61.5); assert.equal(overview.weeklyGrades[0]?.max, 100);
  assert.equal(overview.weeklyGrades[0]?.weeklySession.recorded, false);
});

test('today completion counts complete task types equally and requires teacher approval', () => {
  const today = decodeStudentToday(todayBody({ todayAmounts: [task({ teacherCompleted: true }),
    task({ id: 2, teacherCompleted: true }), task({ id: 3, taskType: 'review', teacherCompleted: false }),
    task({ id: 4, taskType: 'link', teacherCompleted: null, studentStatus: 'done' })] }), id);
  assert.equal(studentTodayGroups(today).percent, 33);
  assert.deepEqual(studentTodayGroups(today).groups.map(group => group.complete), [true, false, false]);
  assert.equal(studentTodayGroups(decodeStudentToday(todayBody({ todayAmounts: [] }), id)).percent, 0);
});

test('mastery label and pending/failure group results follow the web contract', () => {
  const today = decodeStudentToday(todayBody({ plan: { track: 'mastery', progressPercent: 0 } }), id);
  assert.equal(studentTodayGroups(today).groups[0]?.label, 'الإتقان');
  assert.equal(studentTaskResult(today.amounts), 'بانتظار التقييم');
  const failed = decodeStudentToday(todayBody({ todayAmounts: [task({ taskType: 'review', teacherCompleted: true }),
    task({ id: 2, taskType: 'review', teacherCompleted: false, mistakeCount: 2 })] }), id);
  assert.equal(studentTaskResult(failed.amounts), 'راسب · 2 أخطاء');
});

test('legacy student/both settings cannot authorize student execution or repetition', () => {
  for (const taskType of ['memorization', 'review', 'link', 'repeat'] as const) {
    const today = decodeStudentToday(todayBody({ tasks: [task({ taskType })],
      executionSources: { [taskType]: 'both' } }), id);
    assert.equal(studentExecutionEligible(today, taskType), false);
  }
});

test('ranges preserve descending surah traversal without filling Quran gaps', () => {
  const range = decodeStudentRange({ fromSurah: 114, fromAyah: 1, toSurah: 112, toAyah: 4,
    fromPage: 604, toPage: 604, fromSurahName: 'الناس', toSurahName: 'الإخلاص' });
  assert.equal(studentRangeLabel(range), 'الناس آية 1 إلى الإخلاص آية 4');
  assert.equal(range.fromSurah, 114); assert.equal(range.toSurah, 112);
  assert.equal(studentRangeLabel(decodeStudentRange({ startPage: 1, endPage: 2 })), 'من صفحة 1 إلى 2');
});

test('invalid bounds, partial coordinates and impossible dates are rejected', () => {
  for (const range of [{ fromPage: 0, toPage: 2 }, { fromPage: 1, toPage: 605 },
    { fromSurah: 115, fromAyah: 1, toSurah: 2, toAyah: 1 }, { fromSurah: 1, fromAyah: 1 }, {},
    { fromSurah: 2, fromAyah: 287, toSurah: 2, toAyah: 1 }]) invalid(() => decodeStudentRange(range));
  for (const date of ['2026-02-30', '2026-13-01', '../2026-10-14', '', null]) invalid(() => studentDate(date));
  assert.equal(studentDate('2028-02-29'), '2028-02-29');
});

test('hidden tasks discard all unexpected range and preview fields', () => {
  const today = decodeStudentToday(todayBody({ todayAmounts: [task({ amountHidden: true,
    ayahPreview: 'unexpected hidden amount', actualPreview: 'unexpected hidden result', fromPage: 999 })] }), id);
  assert.equal(today.amounts[0]?.range, null); assert.equal(today.amounts[0]?.amount, '');
  const weeks = studentPlanWeeks({ today: decodeStudentToday(todayBody({ todayAmounts: [], hideStudentMemorizationAmount: true }), id),
    overview: decodeStudentOverview(overviewBody(), id) });
  assert.equal(weeks[0]?.days[0]?.tasks[0]?.range, null); assert.equal(weeks[0]?.days[0]?.tasks[0]?.amount, '');
});

test('tomorrow preview has no permanent student/task identity and is never treated as execution', () => {
  const preview = { id: 'preview-review-0', taskType: 'review', track: 'memorization',
    fromPage: 1, toPage: 2, fromSurah: 1, fromAyah: 1, toSurah: 2, toAyah: 5 };
  const today = decodeStudentToday(todayBody({ nextDay: { date: '2026-10-15', tasks: [preview] } }), id);
  assert.equal(today.nextDay?.tasks[0]?.id, 'preview-review-0'); assert.equal(today.tasks.length, 0);
  invalid(() => decodeStudentToday(todayBody({ nextDay: { date: '2026-10-16', tasks: [preview] } }), id));
  invalid(() => decodeStudentToday(todayBody({ nextDay: { date: '2026-10-15', tasks: [{ ...preview, studentId: 8 }] } }), id));
});

test('plan weeks deduplicate history/today and retain reading-only weeks and points-only days', () => {
  const today = decodeStudentToday(todayBody(), id);
  const overview = decodeStudentOverview(overviewBody({ rows: [task({ teacherCompleted: true }),
    task({ id: 2, taskDate: '2026-10-15' })], weeklyGrades: [gradeBody(), gradeBody({ weekStart: '2026-10-04', weekEnd: '2026-10-10',
      records: { '2026-10-06': { reading: { grade: 2, max: 2, passed: true, detail: { requiredFaces: 3 } } } } })] }), id);
  const weeks = studentPlanWeeks({ today, overview });
  assert.deepEqual(weeks.map(week => week.start), ['2026-10-11', '2026-10-04']);
  assert.equal(weeks[0]?.days[0]?.tasks.length, 1); assert.equal(weeks[0]?.days[0]?.tasks[0]?.teacherCompleted, true);
  assert.equal(weeks[1]?.days[0]?.date, '2026-10-06'); assert.equal(weeks[1]?.days[0]?.tasks.length, 0);
  assert.equal(weeks[0]?.days.some(day => day.date > date), false);
});

test('weekly reading, recorded attendance, repetition and listening use actual server values', () => {
  const overview = decodeStudentOverview(overviewBody({ rows: [task({ teacherCompleted: true, actualRepeatCount: 40, actualListeningCount: 3 })],
    weeklyGrades: [gradeBody({ records: { [date]: { attendance: { grade: 1, max: 1, passed: true, detail: { status: 'present' } },
      reading: { grade: 2, max: 2, passed: true, detail: { hizbCount: 2, range: { startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 5 } } } } } })] }), id);
  assert.equal(overview.rows[0]?.actualRepeatCount, 40); assert.equal(overview.rows[0]?.actualListeningCount, 3);
  const records = overview.weeklyGrades[0]?.records[date];
  assert.equal(records?.attendance?.status, 'present'); assert.equal(records?.reading?.readingAmount, '2 أحزاب');
  assert.equal(records?.reading?.ranges.length, 1); assert.equal(records?.reading?.passed, true);
});

test('scheduled but unrecorded attendance and reading remain pending rather than successful', () => {
  const overview = decodeStudentOverview(overviewBody({ weeklyGrades: [gradeBody({ days: [
    { date, components: { attendance: { grade: 0, max: 1 }, reading: { grade: 0, max: 2 } } },
    { date: '2026-10-15', excluded: true, components: { reading: { grade: 0, max: 2 } } },
  ] })] }), id);
  assert.deepEqual(overview.weeklyGrades[0]?.scheduledRecords[date], { attendance: true, reading: true });
  assert.equal(overview.weeklyGrades[0]?.records[date], undefined);
  assert.equal(overview.weeklyGrades[0]?.scheduledRecords['2026-10-15'], undefined);
});

test('session segments retain compensated status and hide ranges by server policy', () => {
  const overview = decodeStudentOverview(overviewBody({ weeklyGrades: [gradeBody({ trackDetail: { attended: true,
    segments: [{ source: 'review', recorded: false, compensated: true, grade: 1, max: 1, amountHidden: true,
      range: { fromSurah: 500 } }] } })] }), id);
  assert.equal(overview.weeklyGrades[0]?.trackAttendance, 'present');
  assert.equal(overview.weeklyGrades[0]?.trackSegments[0]?.compensated, true);
  assert.equal(overview.weeklyGrades[0]?.trackSegments[0]?.range, null);
});

test('saved juz progress does not reconstruct missing memorization segments', () => {
  const saved = decodeStudentSaved([{ juz: 30, label: 'الجزء 30', progressPercent: 1, isComplete: false,
    savedRanges: [{ fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 3 }] }]);
  assert.equal(saved[0]?.isComplete, false); assert.equal(saved[0]?.savedRanges.length, 1);
  assert.equal(saved[0]?.savedRanges[0]?.toAyah, 3);
  assert.deepEqual(decodeStudentSaved([]), []);
  invalid(() => decodeStudentSaved([{ juz: 31, label: 'bad', progressPercent: 20, savedRanges: [] }]));
});

test('level parsing preserves server-computed days and rejects malformed percentages', () => {
  assert.equal(decodeStudentLevel({ key: 'level', name: 'مستوى', progressPercent: '12.5', finished: false, since: date, days: 4 }).progressPercent, 12.5);
  invalid(() => decodeStudentLevel({ key: 'level', name: 'مستوى', progressPercent: 101, since: date, days: 4 }));
});

test('news accepts bounded server-normalized image data and rejects external/traversal schemes', () => {
  assert.equal(decodeStudentNews({ entries: [{ id: 'news-1', title: 'خبر', body: 'نص', image: 'data:image/webp;base64,AAAA' }] })[0]?.title, 'خبر');
  assert.deepEqual(decodeStudentNews({ entries: [] }), []);
  for (const image of ['file:///secret', 'https://example.invalid/pixel', 'javascript:alert(1)']) {
    invalid(() => decodeStudentNews({ entries: [{ id: 'bad', title: 'خبر', image }] }));
  }
});

test('foreign task/plan/weekly identities and malformed scalar types fail closed', () => {
  invalid(() => decodeStudentToday(todayBody({ todayAmounts: [task({ studentId: 8 })] }), id));
  invalid(() => decodeStudentToday(todayBody({ plan: { studentId: 8 } }), id));
  invalid(() => decodeStudentOverview(overviewBody({ weeklyGrades: [gradeBody({ studentId: 8 })] }), id));
  invalid(() => decodeStudentOverview(overviewBody({ points: { total: true, days: [] } }), id));
  invalid(() => decodeStudentToday(todayBody({ todayAmounts: [task({ teacherCompleted: 'false' })] }), id));
  invalid(() => decodeStudentToday(todayBody({ todayAmounts: [task({ taskType: 'admin' })] }), id));
  invalid(() => decodeStudentToday(todayBody({ todayAmounts: [task({ taskDate: '2026-10-13' })] }), id));
});

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
async function setup(handler?: NativeFetch, role: NativeSession['role'] = 'student') {
  const requests: { path: string; method: string; headers: Headers }[] = [];
  const storage: SessionStorage = { load: async () => null, save: async () => {}, clear: async () => {} };
  const fetch: NativeFetch = async (url, init) => {
    const path = new URL(url).pathname + new URL(url).search;
    requests.push({ path, method: init.method ?? 'GET', headers: new Headers(init.headers) });
    if (path === '/api/auth/login') return response({ ...identity, role, token });
    if (path === '/api/auth/logout') return response({ ok: true });
    if (handler) return handler(url, init);
    return response(path.endsWith('quran-today') ? todayBody() : path.includes('quran-sessions') ? overviewBody()
      : path.endsWith('quran-level') ? { key: 'level', name: 'مستوى', progressPercent: 0, finished: false, since: date, days: 0 }
        : path.endsWith('quran-saved') ? [] : { entries: [] });
  };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch }), storage });
  await controller.login({ loginNumber: '0007', password: '', registrationNumber: 'native-fixture' });
  requests.length = 0;
  return { controller, requests };
}

test('student API derives all paths and tenant/token headers from the authenticated session', async () => {
  const { controller, requests } = await setup(); const api = createStudentDashboardApi(controller);
  await api.loadPlan(); await api.loadLevel(); await api.loadSaved(); await api.loadNews();
  assert.deepEqual(requests.map(request => request.path), [`/api/students/${id}/quran-today`,
    `/api/students/${id}/quran-sessions?view=plan&includePoints=1`, `/api/students/${id}/quran-level`, `/api/students/${id}/quran-saved`, '/api/student-news']);
  for (const request of requests) {
    assert.equal(request.method, 'GET'); assert.equal(request.headers.get('X-Registration-Number'), 'native-fixture');
    assert.equal(request.headers.get('Authorization'), `Bearer ${token}`);
  }
});

test('today assignment preparation must finish before plan history starts', async () => {
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const { controller, requests } = await setup(async url => { if (url.endsWith('quran-today')) { await waiting; return response(todayBody()); } return response(overviewBody()); });
  const pending = createStudentDashboardApi(controller).loadPlan(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requests.length, 1); release(); await pending; assert.equal(requests.length, 2);
});

test('non-student and signed-out sessions cannot issue any student read', async () => {
  const { controller, requests } = await setup(undefined, 'manager');
  assert.throws(() => createStudentDashboardApi(controller), code('forbidden')); assert.equal(requests.length, 0);
  const student = await setup(); const api = createStudentDashboardApi(student.controller); await student.controller.logout();
  student.requests.length = 0; await assert.rejects(api.loadLevel(), code('unauthorized')); assert.equal(student.requests.length, 0);
});

test('student API discards foreign returned tasks rather than displaying another account', async () => {
  const { controller, requests } = await setup(async () => response(todayBody({ todayAmounts: [task({ studentId: 8 })] })));
  await assert.rejects(createStudentDashboardApi(controller).loadPlan(), code('invalid-response')); assert.equal(requests.length, 1);
});

test('a bound service cannot be reused after switching student account or tenant', async () => {
  for (const switched of [{ ...identity, id: 8 }, { ...identity, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }]) {
    let logins = 0; let studentReads = 0;
    const storage: SessionStorage = { load: async () => null, save: async () => {}, clear: async () => {} };
    const controller = createNativeSession({ storage, api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async url => {
      if (url.endsWith('/auth/login')) return response({ ...(logins++ ? switched : identity), token });
      if (url.endsWith('/auth/logout')) return response({ ok: true });
      studentReads += 1; return response([]);
    } }) });
    await controller.login({ loginNumber: '7', password: '', registrationNumber: 'native-fixture' });
    const bound = createStudentDashboardApi(controller);
    await controller.login({ loginNumber: '8', password: '', registrationNumber: switched.complex.registrationNumber });
    await assert.rejects(bound.loadSaved(), code('cancelled')); assert.equal(studentReads, 0);
  }
});

test('logout during a delayed read cancels the result without exposing stale student data', async () => {
  let release: () => void = () => {}; const waiting = new Promise<void>(resolve => { release = resolve; });
  const { controller } = await setup(async () => { await waiting; return response({ key: 'level', name: 'مستوى', progressPercent: 0, since: date, days: 0 }); });
  const pending = createStudentDashboardApi(controller).loadLevel();
  const rejected = assert.rejects(pending, error => code('cancelled')(error) || code('unauthorized')(error));
  await controller.logout(); release(); await rejected;
});

test('native API error handling keeps statuses distinct and does not expose raw server errors', async () => {
  for (const [status, expected] of [[403, 'forbidden'], [401, 'unauthorized'], [500, 'server']] as const) {
    const { controller } = await setup(async () => response({ message: 'SQL internal secret' }, status));
    await assert.rejects(createStudentDashboardApi(controller).loadSaved(), error => {
      assert.equal(studentDashboardError(error, '' ).includes('SQL'), false); return code(expected)(error);
    });
  }
  assert.equal(studentDashboardError(new Error('raw stack and path'), 'تعذّر تحميل الخطة.'), 'تعذّر تحميل الخطة.');
});

test('explicit abort prevents history follow-up and reaches the native session request', async () => {
  const { controller, requests } = await setup(); const abort = new AbortController(); abort.abort();
  await assert.rejects(createStudentDashboardApi(controller).loadPlan({ signal: abort.signal }), code('cancelled'));
  assert.equal(requests.length, 0);
});
