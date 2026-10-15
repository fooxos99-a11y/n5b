import assert from 'node:assert/strict';
import test from 'node:test';
import { canSetStudentAttendance, decodeStaffAttendance, decodeSupervisorEvaluation, decodeSupervisorHistory,
  decodeSupervisorRoster, filterLabels, filterSupervisorStudents, supervisorReadingAmount, supervisorTaskAmount,
  supervisorTaskStatus, supervisorTaskStatusLabel, validSupervisorDate } from '../src/domain/supervisorDashboard';
import { createNativeSession, type NativeSession, type SessionStorage } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeApiErrorCode, type NativeFetch } from '../src/services/nativeApi';
import { createSupervisorDashboardApi } from '../src/services/supervisorDashboardApi';

const date = '2026-10-14';
const identity: NativeSession = { role: 'supervisor', id: 7, name: 'مشرف الاختبار', dashboardPermissions: [],
  complex: { registrationNumber: 'native-fixture', name: 'جهة الاختبار' } };
const token = 'a'.repeat(64);
const task = (overrides: Record<string, unknown> = {}) => ({ id: 31, studentId: 11, taskDate: date,
  taskType: 'memorization', trackLabel: 'الحفظ', preview: 'الفاتحة 1 إلى 7', actualPreview: '', pagePreview: 'صفحة 1',
  targetPages: 1, teacherCompleted: null, teacherRatingKey: null, warningCount: 0, hesitationCount: 0,
  mistakeCount: 0, evaluationScore: null, evaluationMaxScore: null, compensationIndex: 0, ...overrides });
const student = (overrides: Record<string, unknown> = {}) => ({ studentId: 11, studentName: 'أَحمد الاختبار',
  committeeName: 'حلقة الاختبار', attendanceStatus: '', canSetAttendance: true, recitationFinished: false, ...overrides });
const reading = (overrides: Record<string, unknown> = {}) => ({ studentId: 11, status: null, faces: 2,
  recordedFaces: null, hizbCount: null, fromHizb: null, toHizb: null,
  amount: { faces: 2, hizbCount: 0.25, fromHizb: null, toHizb: null }, ...overrides });
const evaluationBody = (overrides: Record<string, unknown> = {}) => ({ date, previousSessionDate: '2026-10-13',
  recitationAttendanceSource: 'teacher', students: [student()], tasks: [task()], reading: [], ...overrides });
const rosterBody = () => [{ id: 11, name: 'أحمد الاختبار', committeeName: 'حلقة الاختبار', loginNumber: 'private-login' }];
const staffBody = (overrides: Record<string, unknown> = {}) => ({ enabled: true, source: 'teacher', date,
  alreadyPresent: false, canAttend: true, status: null, checkInTime: null,
  offlinePolicy: { locationRequired: false, targetLatitude: null, targetLongitude: null, radiusMeters: 150 }, ...overrides });
const historyBody = (overrides: Record<string, unknown> = {}) => ({ rows: [{ ...task({ id: 'historical-display-id', teacherCompleted: true }),
  taskId: 31, sessionId: 'session-11-2026-10-13', sessionDate: '2026-10-13', teacherName: 'مشرف الاختبار', attemptNumber: 1, ...overrides }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json' } });
const code = (expected: NativeApiErrorCode) => (error: unknown) => error instanceof NativeApiError && error.code === expected;
const invalid = (callback: () => unknown) => assert.throws(callback, code('invalid-response'));
const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(complete => { resolve = complete; });
  return { promise, resolve };
};
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function setup(handler?: NativeFetch, initial = identity) {
  let loginIdentity = initial;
  const requests: { path: string; method: string; body: unknown; headers: Headers }[] = [];
  const storage: SessionStorage = { load: async () => null, save: async () => {}, clear: async () => {} };
  const controller = createNativeSession({ storage, api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, init) => {
    if (url.endsWith('/auth/login')) return response({ ...loginIdentity, token });
    if (url.endsWith('/auth/logout')) return response({ ok: true });
    const path = new URL(url).pathname + new URL(url).search;
    requests.push({ path, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      headers: new Headers(init.headers) });
    if (handler) return handler(url, init);
    if (path.includes('quran-evaluation')) return response(evaluationBody());
    if (path.includes('student-recitation-history')) return response(historyBody());
    if (path.endsWith('/reports/students')) return response(rosterBody());
    if (path.endsWith('/staff-attendance/me')) return response(init.method === 'POST'
      ? staffBody({ alreadyPresent: true, canAttend: false, status: 'present', checkInTime: '16:12' }) : staffBody());
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as { date: string; status: string } : null;
    return response({ ok: true, date: body?.date, status: body?.status });
  } }) });
  await controller.login({ loginNumber: '700', password: '', registrationNumber: initial.complex.registrationNumber });
  return { controller, requests, api: createSupervisorDashboardApi(initial, controller), switchIdentity: async (next: NativeSession) => {
    loginIdentity = next;
    await controller.login({ loginNumber: '701', password: '', registrationNumber: next.complex.registrationNumber });
  } };
}

test('roster retains only names, circles and safe IDs, never login numbers or unknown personal fields', () => {
  const roster = decodeSupervisorRoster([{ ...rosterBody()[0], guardianPhone: 'private-phone', passwordHash: 'private-hash' }]);
  assert.deepEqual(Object.keys(roster[0] ?? {}).sort(), ['committeeName', 'id', 'name']);
  assert.equal(JSON.stringify(roster).includes('private-'), false);
  invalid(() => decodeSupervisorRoster([rosterBody()[0], rosterBody()[0]]));
});

test('amounts and result labels use the server values for all task types without calculating a new grade', () => {
  const evaluation = decodeSupervisorEvaluation(evaluationBody({ tasks: ['memorization', 'review', 'link', 'repeat'].map((taskType, index) =>
    task({ taskType, id: 31 + index, teacherCompleted: index < 2 ? true : index === 2 ? false : null,
      actualPreview: index === 0 ? 'مقدار التسميع الفعلي' : '', mistakeCount: index === 1 ? 1 : 0 })) }));
  assert.deepEqual(evaluation.tasks.map(supervisorTaskStatus), ['completed', 'completed', 'retry', 'pending']);
  assert.deepEqual(evaluation.tasks.map(supervisorTaskStatusLabel), ['متقن', 'اجتاز', 'يحتاج إعادة', 'لم يقيّم']);
  assert.equal(supervisorTaskAmount(evaluation.tasks[0]!), 'مقدار التسميع الفعلي');
  assert.equal(supervisorTaskAmount(evaluation.tasks[1]!), 'الفاتحة 1 إلى 7');
});

test('pending repeat-required and self reading statuses join the task filter; Arabic search normalizes only display text', () => {
  const evaluation = decodeSupervisorEvaluation(evaluationBody({ tasks: [task({ teacherRatingKey: 'repeat_required' })],
    reading: [reading({ status: 'read' })] }));
  assert.equal(filterSupervisorStudents(evaluation, 'احمد', 'retry').length, 1);
  assert.equal(filterSupervisorStudents(evaluation, 'حلقة', 'completed').length, 1);
  assert.equal(filterSupervisorStudents(evaluation, 'لا يوجد', 'all').length, 0);
  assert.equal(filterSupervisorStudents(evaluation, '', 'pending').length, 0);
});

test('a finished same-day recitation with no returned tasks remains completed without inferring a passing grade', () => {
  // Server omits attempts already recorded for this day; web uses recitationFinished to show اكتمال التسميع.
  const evaluation = decodeSupervisorEvaluation(evaluationBody({ tasks: [], reading: [],
    students: [student({ recitationFinished: true }), student({ studentId: 12, studentName: 'طالب لم يبدأ' })] }));
  assert.deepEqual(filterSupervisorStudents(evaluation, '', 'completed').map(student => student.id), [11]);
  assert.equal(filterSupervisorStudents(evaluation, '', 'pending').length, 0);
  assert.equal(filterSupervisorStudents(evaluation, '', 'retry').length, 0);
  assert.equal(filterSupervisorStudents(evaluation, 'غير مطابق', 'completed').length, 0);
  assert.equal(evaluation.tasks.length, 0); assert.equal(evaluation.students[0]?.recitationFinished, true);
  assert.equal('teacherCompleted' in evaluation.students[0]!, false);
  assert.equal('evaluationScore' in evaluation.students[0]!, false);
  assert.equal(filterLabels.completed, 'مكتمل');
});

test('finished recitation does not turn pending reading or retry tasks into a passing task result', () => {
  const evaluation = decodeSupervisorEvaluation(evaluationBody({ students: [student({ recitationFinished: true })],
    tasks: [task({ teacherCompleted: false })], reading: [reading({ status: null })] }));
  assert.equal(filterSupervisorStudents(evaluation, '', 'completed').length, 1);
  assert.equal(filterSupervisorStudents(evaluation, '', 'retry').length, 1);
  assert.equal(filterSupervisorStudents(evaluation, '', 'pending').length, 1);
  assert.equal(supervisorTaskStatus(evaluation.tasks[0]!), 'retry');
  assert.equal(supervisorTaskStatusLabel(evaluation.tasks[0]!), 'يحتاج إعادة');
  assert.equal(evaluation.reading[0]?.status, null);
});

test('reading-only response does not permit attendance and preserves recorded reading amounts', () => {
  const value = decodeSupervisorEvaluation(evaluationBody({ readingOnly: true, tasks: [],
    students: [student({ canSetAttendance: false, recitationFinished: undefined })],
    reading: [reading({ status: 'read', recordedFaces: 5, hizbCount: 1, fromHizb: 2, toHizb: 2 })] }));
  assert.equal(canSetStudentAttendance(value, 11), false);
  assert.equal(value.reading[0]?.faces, 5);
  assert.equal(supervisorReadingAmount(value.reading[0]!), '1 حزب؛ من الحزب 2 إلى 2');
});

test('decoders reject foreign student details, duplicate tasks, malformed statuses and impossible dates', () => {
  for (const body of [evaluationBody({ tasks: [task({ studentId: 12 })] }),
    evaluationBody({ reading: [reading({ studentId: 12 })] }), evaluationBody({ tasks: [task(), task()] }),
    evaluationBody({ students: [student({ attendanceStatus: 'approved' })] }),
    evaluationBody({ tasks: [task({ teacherCompleted: 'true' })] }),
    evaluationBody({ reading: [reading({ status: 'approved' })] }), evaluationBody({ date: '2026-02-30' })]) {
    invalid(() => decodeSupervisorEvaluation(body));
  }
  assert.equal(validSupervisorDate('2028-02-29'), true);
  assert.equal(validSupervisorDate('../2026-10-14'), false);
  invalid(() => decodeSupervisorEvaluation(evaluationBody({ reading: [reading(), reading()] })));
});

test('staff policy accepts disabled mode but rejects contradictory gates and malformed geofence', () => {
  const disabled = decodeStaffAttendance(staffBody({ enabled: false, source: 'supervisor', canAttend: false, offlinePolicy: null }));
  assert.equal(disabled.policy, null);
  for (const body of [staffBody({ alreadyPresent: true }), staffBody({ source: 'supervisor' }),
    staffBody({ offlinePolicy: null }), staffBody({ offlinePolicy: { locationRequired: true, targetLatitude: null,
      targetLongitude: 46, radiusMeters: 150 } }), staffBody({ offlinePolicy: { locationRequired: true,
      targetLatitude: 91, targetLongitude: 46, radiusMeters: 150 } }), staffBody({ offlinePolicy: { locationRequired: true,
      targetLatitude: true, targetLongitude: 46, radiusMeters: 150 } })]) invalid(() => decodeStaffAttendance(body));
});

test('previous session history uses taskId and official server attempt metadata and rejects a different student', () => {
  const rows = decodeSupervisorHistory(historyBody(), 11);
  assert.equal(rows[0]?.id, 31); assert.equal(rows[0]?.attemptNumber, 1); assert.equal(rows[0]?.sessionDate, '2026-10-13');
  invalid(() => decodeSupervisorHistory(historyBody({ studentId: 12 }), 11));
  invalid(() => decodeSupervisorHistory(historyBody({ attemptNumber: 0 }), 11));
});

test('all reads use own supervisor ID and authenticated tenant headers; no caller can choose another supervisor', async () => {
  const { api, requests } = await setup();
  await api.loadEvaluation({ date }); await api.loadRoster(); await api.loadStaffAttendance(); await api.loadStudentHistory(11);
  assert.deepEqual(requests.map(request => request.path), ['/api/supervisors/7/quran-evaluation?date=2026-10-14',
    '/api/reports/students', '/api/staff-attendance/me', '/api/reports/student-recitation-history?studentId=11']);
  for (const request of requests) {
    assert.equal(request.headers.get('X-Registration-Number'), 'native-fixture');
    assert.equal(request.headers.get('Authorization'), `Bearer ${token}`); assert.equal(request.method, 'GET');
  }
});

test('other roles cannot create a supervisor service and switched IDs or tenants cannot reuse one', async () => {
  const { controller, requests } = await setup();
  for (const role of ['manager', 'student', 'admin'] as const) {
    assert.throws(() => createSupervisorDashboardApi({ ...identity, role }, controller), code('unauthorized'));
  }
  assert.equal(requests.length, 0);
  for (const next of [{ ...identity, id: 8 }, { ...identity, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }]) {
    const scoped = await setup(); await scoped.switchIdentity(next);
    await assert.rejects(scoped.api.loadEvaluation(), code('unauthorized')); assert.equal(scoped.requests.length, 0);
  }
});

test('student attendance posts exact recitation_teacher contract and does not change the prior server snapshot', async () => {
  const { api, requests } = await setup(); const value = await api.loadEvaluation();
  await api.setStudentAttendance(value, 11, 'present');
  assert.deepEqual(requests[1]?.body, { mode: 'recitation_teacher', date, status: 'present' });
  assert.equal(requests[1]?.path, '/api/students/11/attendance'); assert.equal(requests[1]?.method, 'POST');
  assert.equal(value.students[0]?.attendanceStatus, null);
});

test('attendance cannot target outside roster, cloned DTOs, unsupported status or supervisor-managed policy', async () => {
  const { api, requests } = await setup(); const value = await api.loadEvaluation();
  await assert.rejects(api.setStudentAttendance(value, 12, 'present'), code('forbidden'));
  await assert.rejects(api.setStudentAttendance({ ...value }, 11, 'present'), code('forbidden'));
  await assert.rejects(api.setStudentAttendance(value, 11, 'unknown' as 'present'), code('validation'));
  assert.equal(requests.length, 1);
  for (const overrides of [{ recitationAttendanceSource: 'supervisor' }, { students: [student({ canSetAttendance: false })] }]) {
    const scoped = await setup(async () => response(evaluationBody(overrides))); const record = await scoped.api.loadEvaluation();
    await assert.rejects(scoped.api.setStudentAttendance(record, 11, 'present'), code('forbidden')); assert.equal(scoped.requests.length, 1);
  }
});

test('a refreshed evaluation invalidates its older attendance snapshot', async () => {
  const { api, requests } = await setup(); const old = await api.loadEvaluation(); await api.loadEvaluation();
  await assert.rejects(api.setStudentAttendance(old, 11, 'present'), code('forbidden')); assert.equal(requests.length, 2);
});

test('duplicate attendance clicks issue only one mutation', async () => {
  const waiting = deferred();
  const { api, requests } = await setup(async (url, init) => {
    if (init.method === 'POST') { await waiting.promise; return response({ ok: true, date, status: 'late' }); }
    return response(evaluationBody());
  });
  const value = await api.loadEvaluation(); const pending = api.setStudentAttendance(value, 11, 'late');
  await assert.rejects(api.setStudentAttendance(value, 11, 'late'), code('forbidden'));
  waiting.resolve(); await pending; assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('attendance acknowledgement must match the saved date and status', async () => {
  const { api } = await setup(async (url, init) => response(init.method === 'POST'
    ? { ok: true, date: '2026-10-13', status: 'present' } : evaluationBody()));
  const value = await api.loadEvaluation(); await assert.rejects(api.setStudentAttendance(value, 11, 'present'), code('invalid-response'));
});

test('staff check-in sends no account ID, date or unnecessary GPS when the current policy does not require it', async () => {
  const { api, requests } = await setup(); const record = await api.loadStaffAttendance();
  const saved = await api.checkInStaffAttendance(record, { latitude: 24.5, longitude: 46.5 });
  assert.deepEqual(requests[1]?.body, {}); assert.equal(saved.alreadyPresent, true); assert.equal(saved.canAttend, false);
  await assert.rejects(api.checkInStaffAttendance(saved), code('forbidden'));
  assert.equal(requests.length, 2);
});

test('disabled, out-of-workday, already-present or forged staff snapshots cannot post', async () => {
  for (const overrides of [{ enabled: false, source: 'supervisor', canAttend: false, offlinePolicy: null },
    { canAttend: false }, { alreadyPresent: true, canAttend: false, status: 'present' }]) {
    const { api, requests } = await setup(async () => response(staffBody(overrides))); const record = await api.loadStaffAttendance();
    await assert.rejects(api.checkInStaffAttendance(record), code('forbidden')); assert.equal(requests.length, 1);
  }
  const { api, requests } = await setup(); const record = await api.loadStaffAttendance();
  await assert.rejects(api.checkInStaffAttendance({ ...record }), code('forbidden')); assert.equal(requests.length, 1);
});

test('geofence uses shared distance policy, requires real valid coordinates and blocks out-of-radius requests', async () => {
  const policy = { locationRequired: true, targetLatitude: 24.5, targetLongitude: 46.5, radiusMeters: 150 };
  const { api, requests } = await setup(async (url, init) => response(staffBody({ offlinePolicy: policy,
    ...(init.method === 'POST' ? { alreadyPresent: true, canAttend: false, status: 'present' } : {}) })));
  const record = await api.loadStaffAttendance();
  await assert.rejects(api.checkInStaffAttendance(record), code('validation'));
  await assert.rejects(api.checkInStaffAttendance(record, { latitude: NaN, longitude: 46.5 }), code('validation'));
  await assert.rejects(api.checkInStaffAttendance(record, { latitude: 25, longitude: 46.5 }), code('forbidden'));
  assert.equal(requests.length, 1);
  await api.checkInStaffAttendance(record, { latitude: 24.5001, longitude: 46.5 });
  assert.deepEqual(requests[1]?.body, { latitude: 24.5001, longitude: 46.5 });
});

test('history requires a loaded scoped roster and validates returned student identity', async () => {
  const { api, requests } = await setup();
  await assert.rejects(api.loadStudentHistory(11), code('forbidden')); await api.loadRoster();
  await assert.rejects(api.loadStudentHistory(12), code('forbidden')); assert.equal(requests.length, 1);
  const foreign = await setup(async url => response(url.endsWith('/reports/students') ? rosterBody() : historyBody({ studentId: 12 })));
  await foreign.api.loadRoster(); await assert.rejects(foreign.api.loadStudentHistory(11), code('invalid-response'));
});

test('superseded evaluation and roster responses cannot replace the newest server snapshot', async () => {
  for (const kind of ['evaluation', 'roster'] as const) {
    const waiting = deferred(); let reads = 0;
    const { api } = await setup(async () => { if (reads++ === 0) await waiting.promise;
      return response(kind === 'evaluation' ? evaluationBody() : rosterBody()); });
    const old = kind === 'evaluation' ? api.loadEvaluation() : api.loadRoster();
    const rejected = assert.rejects(old, code('cancelled')); await tick();
    if (kind === 'evaluation') await api.loadEvaluation(); else await api.loadRoster();
    waiting.resolve(); await rejected;
  }
});

test('account switch during delayed evaluation cancels the old data instead of publishing it', async () => {
  const waiting = deferred(); const { api, switchIdentity } = await setup(async () => { await waiting.promise; return response(evaluationBody()); });
  const pending = api.loadEvaluation(); const rejected = assert.rejects(pending, error => code('cancelled')(error) || code('unauthorized')(error));
  await switchIdentity({ ...identity, id: 8 }); waiting.resolve(); await rejected;
});

test('a late staff GET cannot overwrite a successful check-in', async () => {
  const waiting = deferred(); let gets = 0;
  const { api, requests } = await setup(async (url, init) => {
    if (init.method === 'POST') return response(staffBody({ alreadyPresent: true, canAttend: false, status: 'present' }));
    if (gets++ === 1) await waiting.promise;
    return response(staffBody());
  });
  const record = await api.loadStaffAttendance();
  const old = api.loadStaffAttendance(); const rejected = assert.rejects(old, code('cancelled'));
  // Refresh invalidates stale DTOs immediately, preventing a mutation while policy is unknown.
  await assert.rejects(api.checkInStaffAttendance(record), code('forbidden'));
  const fresh = await api.loadStaffAttendance(); const saved = await api.checkInStaffAttendance(fresh);
  waiting.resolve(); await rejected; assert.equal(saved.alreadyPresent, true);
  assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('duplicate staff check-in clicks cannot create simultaneous mutations', async () => {
  const waiting = deferred();
  const { api, requests } = await setup(async (url, init) => {
    if (init.method === 'POST') { await waiting.promise;
      return response(staffBody({ alreadyPresent: true, canAttend: false, status: 'present' })); }
    return response(staffBody());
  });
  const record = await api.loadStaffAttendance(); const pending = api.checkInStaffAttendance(record);
  await assert.rejects(api.checkInStaffAttendance(record), code('forbidden'));
  waiting.resolve(); await pending; assert.equal(requests.filter(request => request.method === 'POST').length, 1);
});

test('403, conflict and offline errors never imply a save or expose server internals; 401 invalidates the session', async () => {
  for (const [status, expected] of [[403, 'forbidden'], [409, 'conflict'], [401, 'unauthorized'], [500, 'server']] as const) {
    const { api, controller } = await setup(async (url, init) => init.method === 'POST'
      ? response({ message: 'SQL secret and path' }, status) : response(evaluationBody()));
    const value = await api.loadEvaluation();
    await assert.rejects(api.setStudentAttendance(value, 11, 'absent'), error => {
      assert.equal(error instanceof Error && error.message.includes('SQL'), false); return code(expected)(error);
    });
    assert.equal(value.students[0]?.attendanceStatus, null);
    assert.equal(controller.getSnapshot().status, status === 401 ? 'signed-out' : 'authenticated');
  }
  const offline = await setup(async (url, init) => { if (init.method === 'POST') throw new Error('private network path'); return response(evaluationBody()); });
  const record = await offline.api.loadEvaluation(); await assert.rejects(offline.api.setStudentAttendance(record, 11, 'absent'), code('network'));
  assert.equal(record.students[0]?.attendanceStatus, null);
});

test('aborted requests and invalid date paths never reach the transport', async () => {
  const { api, requests } = await setup(); const abort = new AbortController(); abort.abort();
  await assert.rejects(api.loadEvaluation({ signal: abort.signal }), code('cancelled'));
  await assert.rejects(api.loadEvaluation({ date: '../other' }), code('validation')); assert.equal(requests.length, 0);
});
