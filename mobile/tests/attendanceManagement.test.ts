import assert from 'node:assert/strict';
import test from 'node:test';
import { AttendanceBatchError, attendanceDate, attendancePolicyDraft, attendanceStatusLabel, canChangeAttendance,
  filterAttendanceRows, normalizeAttendancePolicyDraft, normalizeAttendanceQuery, requireAttendanceAccess,
  studentAttendanceSessionDate, type AttendanceQuery } from '../src/domain/attendanceManagement';
import type { NativeSession, NativeSessionController, NativeSessionSnapshot } from '../src/domain/nativeSession';
import type { StudentAttendanceStatus } from '../src/domain/supervisorDashboard';
import { createAttendanceManagementApi, decodeAttendancePolicy, decodeAttendanceRows } from '../src/services/attendanceManagementApi';
import { NativeApiError } from '../src/services/nativeApi';

const today = '2026-10-14'; const sessionDate = '2026-10-11';
const manager: NativeSession = { role: 'manager', id: 8, name: 'FixtureManager', dashboardPermissions: [],
  complex: { name: 'Fixture', registrationNumber: 'native-attendance-fixture' } };
const administrator: NativeSession = { ...manager, role: 'admin', dashboardPermissions: ['manualAttendance', 'reports', 'settings'] };
const supervisor: NativeSession = { ...administrator, role: 'supervisor', dashboardPermissions: ['manualAttendance', 'reports'] };
const query = (patch: Partial<AttendanceQuery> = {}): AttendanceQuery => ({ target: 'students', date: sessionDate,
  committeeId: 'all', from: sessionDate, to: sessionDate, staffId: 'all', period: false, ...patch });
const publicPolicy = { attendanceManualEnabled: true, attendanceAccountEnabled: true, recitationAttendanceSource: 'supervisor',
  staffAttendanceSource: 'supervisor', staffAttendanceLateAfterAsrMinutes: 50, recitationSessionDays: [0, 1, 2, 3, 4], seasonalHolidays: [] };
const circle = { id: 3, name: 'FixtureCircle', complexId: 4, complexName: 'Fixture', points: 0, studentsCount: 3 };
const reportRows = [1, 2, 3].map(id => ({ id: String(id), name: id === 1 ? 'أحمد مُوسى' : `FixturePupil${id}`,
  loginNumber: `000${id}`, committeeName: 'FixtureCircle', role: 'supervisor', jobTitle: 'مشرف المسار',
  joined: '2026-01-01', status: null as string | null, recordDate: sessionDate, checkInTime: null, checkInMethod: null, distance: null }));
const isCode = (code: string) => (error: unknown) => error instanceof NativeApiError && error.code === code;
interface Call { path: string; method: string; body: Record<string, unknown> | undefined }
interface State { policy: Record<string, unknown>; settings: Record<string, unknown>; rows: Record<string, unknown>[] }
function fixture(actor = manager, handle?: (call: Call, state: State) => unknown | Promise<unknown>) {
  let snapshot: NativeSessionSnapshot = { status: 'authenticated', session: actor, error: null };
  const calls: Call[] = []; const state: State = { policy: structuredClone(publicPolicy), rows: structuredClone(reportRows),
    settings: { ...structuredClone(publicPolicy), automaticExecutionMessageEnabled: true, registrationEnabled: true,
      registrationAcceptTemplate: 'FixtureTemplate', maxSupervisorStudentPoints: 7, familyPointsAddToStudents: true,
      quranTaskExecutionSource: 'teacher', memorizationExecutionSource: 'teacher', reviewExecutionSource: 'teacher',
      linkExecutionSource: 'teacher', repeatExecutionSource: 'teacher', quranReferenceMode: 'page',
      staffAttendanceLocationUrl: 'fixture-location', staffAttendanceLocationLat: 26.4, staffAttendanceLocationLng: 43.9 } };
  const controller: NativeSessionController = {
    getSnapshot: () => snapshot, subscribe: () => () => {}, login: async () => {}, restore: async () => {}, cancel: () => {},
    logout: async () => { snapshot = { status: 'signed-out', session: null, error: null }; return { localCleared: true, serverRevoked: true, error: null }; },
    async request<T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (value: unknown) => T): Promise<T> {
      const call = { path, method: options?.method ?? 'GET', body: options?.body as Record<string, unknown> | undefined }; calls.push(call);
      let value = await handle?.(call, state);
      if (value === undefined) {
        if (path === '/public-settings') value = state.policy;
        else if (path === '/committees') value = [circle];
        else if (path.startsWith('/reports/')) value = state.rows;
        else if (path === '/settings') {
          if (call.method === 'PUT') { state.settings = { ...call.body }; state.policy = { ...state.settings }; }
          value = state.settings;
        } else {
          const id = Number(path.split('/')[2]!); const row = state.rows.find(row => Number(row.id) === id);
          if (row) row.status = call.body?.status;
          value = { ok: true, date: call.body?.date, status: call.body?.status, time: null, distance: null, alreadyPresent: false };
        }
      }
      return decode ? decode(structuredClone(value)) : structuredClone(value) as T;
    },
  };
  return { controller, calls, state, api: createAttendanceManagementApi(controller, () => today),
    change: (next: NativeSession | null) => { snapshot = { status: next ? 'authenticated' : 'signed-out', session: next, error: null }; } };
}
function deferred() { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() }; }

test('attendance dates normalize Arabic and Persian digits and reject impossible dates', () => {
  assert.equal(attendanceDate(' ٢٠٢٦-١٠-١١ '), sessionDate); assert.equal(attendanceDate('۲۰۲۶-۱۰-۱۱'), sessionDate);
  for (const date of ['2026-02-30', '2026-13-01', '2026-1-01', '', 'tomorrow']) assert.throws(() => attendanceDate(date), isCode('validation'));
});
test('attendance queries validate IDs and the actual maximum 366-day period before any request', async () => {
  assert.equal(normalizeAttendanceQuery(query({ from: '2024-01-01', to: '2024-12-31', period: true })).to, '2024-12-31');
  const f = fixture();
  for (const patch of [{ date: '2026-02-30' }, { from: '2026-10-12', to: sessionDate }, { from: '2024-01-01', to: '2025-01-01' },
    { staffId: '0' }, { committeeId: '9007199254740992' }, { staffId: '1.5' }]) await assert.rejects(f.api.load(query(patch)), isCode('validation'));
  assert.equal(f.calls.length, 0);
});
test('students map non-session dates to the previous configured workday while staff retain the exact date', async () => {
  assert.equal(studentAttendanceSessionDate('2026-10-10', [0, 3]), '2026-10-07');
  assert.throws(() => studentAttendanceSessionDate(sessionDate, []), isCode('validation'));
  const f = fixture(); f.state.rows.forEach(row => { row.recordDate = '2026-10-08'; });
  const pupils = await f.api.load(query({ date: '2026-10-10' })); assert.equal(pupils.effectiveDate, '2026-10-08');
  assert.ok(f.calls.some(call => call.path === '/reports/students?date=2026-10-08&committeeId=all'));
  f.state.rows.forEach(row => { row.recordDate = '2026-10-10'; });
  const staff = await f.api.load(query({ target: 'staff', date: '2026-10-10' })); assert.equal(staff.effectiveDate, '2026-10-10');
  assert.ok(f.calls.some(call => call.path === '/reports/supervisors?date=2026-10-10&staffId=all'));
});
test('period reports use from/to/staffId on the existing array endpoint without a fabricated response envelope', async () => {
  const f = fixture(); f.state.rows.push({ ...reportRows[0]!, recordDate: '2026-10-12', status: 'late', checkInTime: '17:05', checkInMethod: 'self', distance: 12 });
  const data = await f.api.load(query({ target: 'staff', from: sessionDate, to: '2026-10-12', staffId: '1', period: true }));
  assert.equal(data.rows.length, 4); assert.notEqual(data.rows[0]!.key, data.rows[3]!.key);
  assert.ok(f.calls.some(call => call.path === '/reports/supervisors?from=2026-10-11&to=2026-10-12&staffId=1'));
  assert.equal(f.calls.some(call => call.path === '/committees'), false);
});
test('report decoders retain SQL string IDs, unrecorded/no-session rows and frozen record identity', () => {
  const rows = decodeAttendanceRows([{ ...reportRows[0]!, recordDate: null }, { ...reportRows[1]!, status: 'no_session' }], 'students', sessionDate);
  assert.equal(rows[0]!.id, 1); assert.equal(rows[0]!.status, 'unrecorded'); assert.equal(rows[1]!.status, 'no_session');
  assert.equal(rows[0]!.role, 'student'); assert.equal(Object.isFrozen(rows), true); assert.equal(Object.isFrozen(rows[0]!), true);
  assert.equal(attendanceStatusLabel('no_session'), 'لا توجد جلسة في هذا اليوم');
  assert.equal(attendanceStatusLabel('unrecorded'), 'لم يُحضّر');
});
test('report decoders reject malformed roles, dates, times, numbers, duplicates and envelopes', () => {
  for (const patch of [{ id: true }, { id: 0 }, { id: '1.5' }, { status: 'invented' }, { recordDate: '2026-02-30' },
    { joined: 'not-date' }, { checkInTime: '17:05:00' }, { distance: -1 }, { name: 4 }]) {
    assert.throws(() => decodeAttendanceRows([{ ...reportRows[0]!, ...patch }], 'students', sessionDate), isCode('invalid-response'));
  }
  assert.throws(() => decodeAttendanceRows([{ ...reportRows[0]!, role: 'manager' }], 'staff', sessionDate), isCode('invalid-response'));
  assert.throws(() => decodeAttendanceRows([reportRows[0]!, reportRows[0]!], 'students', sessionDate), isCode('invalid-response'));
  assert.throws(() => decodeAttendanceRows({ rows: reportRows }, 'staff', sessionDate), isCode('invalid-response'));
});
test('student SQL DATE ISO uses the Riyadh civil date and the exact query day without the execution-day boundary', () => {
  const liveRow = { id: 1, name: 'SessPupilA', loginNumber: '940101', committeeName: 'SessCircle', status: 'absent', checkInTime: null };
  for (const recordDate of [null, '2026-10-14', '2026-10-13T21:00:00.000Z', '2026-10-14T00:00:00.000Z']) {
    const [row] = decodeAttendanceRows([{ ...liveRow, recordDate }], 'students', today);
    assert.equal(row!.recordDate, today); assert.equal(row!.key, '1:2026-10-14'); assert.equal(row!.role, 'student');
    assert.equal(row!.joined, null); assert.equal(row!.jobTitle, '');
  }
});
test('student report dates reject malformed, noncanonical and mismatched ISO/date-only values', () => {
  for (const recordDate of ['2026-10-13', '2026-10-14T21:00:00.000Z', '2026-10-13T00:00:00.000Z', '2026-02-30T21:00:00.000Z',
    '2026-10-13T25:00:00.000Z', '2026-10-13T21:00:00Z', '2026-10-14T00:00:00+03:00', '', 4]) {
    assert.throws(() => decodeAttendanceRows([{ ...reportRows[0]!, recordDate }], 'students', today), isCode('invalid-response'));
  }
});
test('staff record dates remain strict date-only and do not accept student raw DATE serialization', () => {
  assert.equal(decodeAttendanceRows([{ ...reportRows[0]!, recordDate: today }], 'staff', today)[0]!.recordDate, today);
  assert.equal(decodeAttendanceRows([{ ...reportRows[0]!, recordDate: null }], 'staff', today)[0]!.recordDate, today);
  for (const recordDate of ['2026-10-13T21:00:00.000Z', '2026-10-14T00:00:00.000Z', '2026-02-30']) {
    assert.throws(() => decodeAttendanceRows([{ ...reportRows[0]!, recordDate }], 'staff', today), isCode('invalid-response'));
  }
});
test('the limited actual student report and public policy without an account flag load and persist against their exact effective SQL date', async () => {
  const f = fixture(manager, call => {
    if (call.path.startsWith('/reports/students')) return [{ id: 1, name: 'SessPupilA', loginNumber: '940101', committeeName: null,
      status: null, checkInTime: null, recordDate: null }];
  });
  delete f.state.policy.attendanceAccountEnabled;
  const data = await f.api.load(query()); assert.equal(data.rows[0]!.status, 'unrecorded'); assert.equal(data.rows[0]!.committeeName, '');
  assert.equal(f.api.canSet(data, data.rows[0]!), true); await f.api.saveAttendance(data, data.rows, 'present');
  assert.equal(f.calls.find(call => call.method === 'POST')!.body!.date, sessionDate);
});
test('public attendance policy decodes optional account flag and validates weekdays, source, holidays and late minutes', () => {
  const { attendanceAccountEnabled: omitted, ...publicOnly } = publicPolicy; assert.equal(omitted, true);
  const decoded = decodeAttendancePolicy(publicOnly); assert.equal(decoded.attendanceAccountEnabled, false); assert.equal(Object.isFrozen(decoded.recitationSessionDays), true);
  for (const patch of [{ attendanceManualEnabled: 'true' }, { staffAttendanceSource: 'student' }, { recitationSessionDays: [] },
    { recitationSessionDays: [7] }, { staffAttendanceLateAfterAsrMinutes: 0.5 }, { staffAttendanceLateAfterAsrMinutes: 1441 },
    { seasonalHolidays: [{ startDate: '2026-10-12', endDate: sessionDate }] }]) {
    assert.throws(() => decodeAttendancePolicy({ ...publicPolicy, ...patch }), isCode('invalid-response'));
  }
});
test('attendance search and status filtering preserve normalized Arabic names and staff metadata', () => {
  const rows = decodeAttendanceRows(reportRows, 'staff', sessionDate);
  assert.deepEqual(filterAttendanceRows(rows, 'احمد موسي', 'unrecorded'), [rows[0]!]);
  assert.deepEqual(filterAttendanceRows(rows, '0002', 'all'), [rows[1]!]);
  assert.equal(filterAttendanceRows(rows, 'مشرف المسار', 'all').length, 3);
  assert.equal(filterAttendanceRows(rows, 'احمد', 'present').length, 0);
});
test('manager/admin/supervisor guards require both existing read and manual grants, never treating a report 403 as completion', async () => {
  for (const actor of [{ ...administrator, dashboardPermissions: ['manualAttendance'] }, { ...administrator, dashboardPermissions: ['reports'] },
    { ...manager, role: 'student' as const, dashboardPermissions: ['manualAttendance', 'reports'] }]) {
    const f = fixture(actor); await assert.rejects(f.api.load(query()), isCode('forbidden')); assert.equal(f.calls.length, 0);
    assert.throws(() => requireAttendanceAccess(actor, 'students'), isCode('forbidden'));
  }
  const f = fixture(administrator); assert.equal((await f.api.load(query())).rows.length, 3); assert.equal(f.api.canViewStaff(), true);
});
test('supervisor attendance stays in the server-scoped student roster and cannot load or mutate staff', async () => {
  const f = fixture(supervisor); const data = await f.api.load(query());
  assert.equal(data.circles.length, 0); assert.equal(f.calls.some(call => call.path === '/committees'), false); assert.equal(f.api.canViewStaff(), false);
  await assert.rejects(f.api.load(query({ target: 'staff' })), isCode('forbidden'));
  await assert.rejects(f.api.saveAttendance(data, [{ ...data.rows[0]!, id: 99 }], 'present'), isCode('validation'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});
test('attendance applies all four existing manual endpoints and validates each acknowledgement', async () => {
  for (const target of ['students', 'staff'] as const) for (const status of ['present', 'late', 'excused', 'absent'] as const) {
    const f = fixture(); const data = await f.api.load(query({ target })); const result = await f.api.saveAttendance(data, [data.rows[0]!], status);
    assert.deepEqual(result.saved, [data.rows[0]!.key]); const call = f.calls.find(call => call.method === 'POST')!;
    assert.equal(call.path, `/${target === 'students' ? 'students' : 'supervisors'}/1/${status === 'absent' ? 'absence' : 'attendance'}`);
    assert.deepEqual(call.body, { mode: 'manual', date: sessionDate, status }); assert.equal('time' in call.body!, false);
  }
});
test('client rejects invalid staff status before the server fallback can silently record present', async () => {
  const f = fixture(); const data = await f.api.load(query({ target: 'staff' }));
  await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'invalid' as StudentAttendanceStatus), isCode('validation'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});
test('future/non-workday/joined-date/holiday/no-session and manual-source restrictions prevent mutations', async () => {
  for (const target of ['students', 'staff'] as const) for (const patch of [{ recordDate: '2026-10-15' }, { recordDate: '2026-10-09' },
    { joined: '2026-10-12' }, { status: 'no_session' }]) {
    const f = fixture();
    if (target === 'students' && patch.recordDate === '2026-10-09') {
      const data = await f.api.load(query()); const row = { ...data.rows[0]!, recordDate: '2026-10-09' };
      assert.equal(canChangeAttendance(manager, { ...data, rows: [row] }, row, today), false); continue;
    }
    if (patch.recordDate) f.state.rows.forEach(row => { row.recordDate = patch.recordDate; });
    f.state.rows[0]! = { ...f.state.rows[0]!, ...patch }; const data = await f.api.load(query({ target, date: patch.recordDate ?? sessionDate }));
    assert.equal(f.api.canSet(data, data.rows[0]!), false); await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('validation'));
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  }
  for (const patch of [{ attendanceManualEnabled: false }, { seasonalHolidays: [{ startDate: sessionDate, endDate: sessionDate }] }]) {
    const f = fixture(); Object.assign(f.state.policy, patch); const data = await f.api.load(query()); assert.equal(canChangeAttendance(manager, data, data.rows[0]!, today), false);
    await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('validation'));
  }
  const f = fixture(); f.state.policy.staffAttendanceSource = 'teacher'; const data = await f.api.load(query({ target: 'staff' }));
  assert.equal(f.api.canSet(data, data.rows[0]!), false); await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('validation'));
});
test('loaded attendance query is frozen and copied or stale roster objects cannot change targets', async () => {
  const f = fixture(); const first = await f.api.load(query()); assert.equal(Object.isFrozen(first.query), true);
  await assert.rejects(f.api.saveAttendance({ ...first, query: { ...first.query, target: 'staff' } }, [first.rows[0]!], 'present'), isCode('conflict'));
  await f.api.load(query({ committeeId: '3' })); await assert.rejects(f.api.saveAttendance(first, [first.rows[0]!], 'present'), isCode('conflict'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});
test('saved and unchanged student rows are skipped on safe retry without duplicating successful writes', async () => {
  const f = fixture(); f.state.rows[0]!.status = 'present'; const data = await f.api.load(query());
  const first = await f.api.saveAttendance(data, data.rows, 'present'); assert.deepEqual(first.skipped, [data.rows[0]!.key]); assert.equal(first.saved.length, 2);
  const repeated = await f.api.saveAttendance(data, data.rows, 'present'); assert.equal(repeated.saved.length, 0); assert.equal(repeated.skipped.length, 3);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});
test('bulk student attendance records individual known failures while continuing other selected rows', async () => {
  const f = fixture(manager, call => { if (call.path === '/students/2/attendance') throw new NativeApiError('validation', 422); });
  const data = await f.api.load(query()); const result = await f.api.saveAttendance(data, data.rows, 'late');
  assert.deepEqual(result.saved, [data.rows[0]!.key, data.rows[2]!.key]); assert.deepEqual(result.pending, []);
  assert.equal(result.failed[0]!.key, data.rows[1]!.key); assert.equal(result.failed[0]!.code, 'validation');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 3);
});
test('bulk validates every selected reference before writing and rejects duplicate rows and empty selections', async () => {
  const f = fixture(); const data = await f.api.load(query());
  for (const selection of [[], [data.rows[0]!, data.rows[0]!], [data.rows[0]!, { ...data.rows[1]! }]]) {
    await assert.rejects(f.api.saveAttendance(data, selection, 'present'), isCode('validation'));
  }
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});
test('a concurrent bulk write or reload is rejected until the running request settles', async () => {
  const gate = deferred(); const entered = deferred(); const f = fixture(manager, async call => {
    if (call.method === 'POST') { entered.resolve(); await gate.promise; }
  });
  const data = await f.api.load(query()); const pending = f.api.saveAttendance(data, [data.rows[0]!], 'present'); await entered.promise;
  await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'late'), isCode('conflict'));
  await assert.rejects(f.api.load(query({ target: 'staff' })), isCode('conflict')); gate.resolve(); await pending;
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('unknown bulk result stops pending rows and locks repeats until a successful fresh report proves persisted state', async () => {
  let loseReply = true; let failRead = false;
  const f = fixture(manager, (call, state) => {
    if (call.path === '/students/2/attendance' && loseReply) { state.rows[1]!.status = 'present'; loseReply = false; throw new NativeApiError('network'); }
    if (call.path.startsWith('/reports/') && failRead) throw new NativeApiError('server', 503);
  });
  const data = await f.api.load(query()); let partial: AttendanceBatchError | null = null;
  await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), error => {
    assert.ok(error instanceof AttendanceBatchError); partial = error; return error.code === 'network';
  });
  assert.deepEqual(partial!.result.saved, [data.rows[0]!.key]); assert.deepEqual(partial!.result.pending, [data.rows[2]!.key]);
  assert.equal(partial!.result.failed[0]!.key, data.rows[1]!.key);
  await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), isCode('conflict')); assert.equal(f.api.canSet(data, data.rows[0]!), false);
  failRead = true; await assert.rejects(f.api.load(query()), isCode('server')); await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), isCode('conflict'));
  failRead = false; const fresh = await f.api.load(query()); assert.equal(fresh.rows[1]!.status, 'present');
  const retry = await f.api.saveAttendance(fresh, fresh.rows, 'present'); assert.equal(retry.skipped.length, 2); assert.deepEqual(retry.saved, [fresh.rows[2]!.key]);
  assert.deepEqual(f.calls.filter(call => call.method === 'POST').map(call => call.path), ['/students/1/attendance', '/students/2/attendance', '/students/3/attendance']);
});
test('mismatched mutation acknowledgement is uncertain and cannot be retried against the old loaded roster', async () => {
  const f = fixture(manager, call => call.method === 'POST' ? { ok: true, date: sessionDate, status: 'absent' } : undefined);
  const data = await f.api.load(query()); await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('invalid-response'));
  await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('conflict')); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('revoked grants before attendance read/mutation issue no additional requests', async () => {
  const f = fixture(administrator); const data = await f.api.load(query()); const count = f.calls.length;
  f.change({ ...administrator, dashboardPermissions: ['reports'] }); assert.equal(f.api.canSet(data, data.rows[0]!), false);
  await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), isCode('forbidden')); await assert.rejects(f.api.load(query()), isCode('forbidden'));
  assert.equal(f.calls.length, count);
});
test('changed actor ID, role, tenant and signed-out state invalidate cached attendance services before requests', async () => {
  for (const next of [{ ...manager, id: 9 }, { ...manager, role: 'admin' as const }, { ...manager, complex: { ...manager.complex, registrationNumber: 'another-tenant' } }, null]) {
    const f = fixture(); const data = await f.api.load(query()); const count = f.calls.length; f.change(next);
    const code = next ? 'cancelled' : 'unauthorized'; await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), isCode(code));
    await assert.rejects(f.api.load(query()), isCode(code)); await assert.rejects(f.api.loadPolicy(), isCode(code)); assert.equal(f.calls.length, count);
    assert.equal(f.api.canViewStaff(), false); assert.equal(f.api.canEditPolicy(), false);
  }
});
test('identity and grants are rechecked after every attendance read response before exposing data', async () => {
  for (const path of ['/public-settings', '/reports/students?date=2026-10-11&committeeId=all', '/committees']) {
    const f = fixture(administrator, call => { if (call.path === path) f.change({ ...administrator, dashboardPermissions: [] }); });
    await assert.rejects(f.api.load(query()), isCode('forbidden'));
  }
  const f = fixture(manager, call => { if (call.path.startsWith('/reports/')) f.change({ ...manager, id: 9 }); });
  await assert.rejects(f.api.load(query({ target: 'staff' })), isCode('cancelled'));
});
test('identity or grant loss after a saved bulk row stops the following rows and reports pending work', async () => {
  for (const changeIdentity of [false, true]) {
    const f = fixture(administrator, call => { if (call.path === '/students/1/attendance') f.change(changeIdentity ? { ...administrator, id: 9 } : { ...administrator, dashboardPermissions: ['reports'] }); });
    const data = await f.api.load(query()); await assert.rejects(f.api.saveAttendance(data, data.rows, 'present'), error => {
      assert.ok(error instanceof AttendanceBatchError); assert.equal(error.code, changeIdentity ? 'cancelled' : 'forbidden');
      assert.equal(error.result.saved.length, 0); assert.equal(error.result.pending.length, 2); return true;
    });
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  }
});
test('a superseded report cannot restore an earlier roster after a newer query has loaded', async () => {
  const gate = deferred(); const entered = deferred(); const f = fixture(manager, async call => {
    if (call.path === '/reports/students?date=2026-10-11&committeeId=all') { entered.resolve(); await gate.promise; }
  });
  const older = f.api.load(query()); await entered.promise; const fresh = await f.api.load(query({ committeeId: '3' }));
  gate.resolve(); await assert.rejects(older, isCode('cancelled')); assert.equal(f.api.canSet(fresh, fresh.rows[0]!), true);
});
test('policy draft accepts local digits and only the existing source choices and integer 0..1440 minute range', () => {
  const source = decodeAttendancePolicy(publicPolicy); const draft = attendancePolicyDraft(source); assert.equal(draft.lateMinutes, '50');
  assert.equal(normalizeAttendancePolicyDraft({ ...draft, lateMinutes: '١٤٤٠' }, publicPolicy).staffAttendanceLateAfterAsrMinutes, 1440);
  assert.equal(normalizeAttendancePolicyDraft({ ...draft, lateMinutes: '۰' }, publicPolicy).staffAttendanceLateAfterAsrMinutes, 0);
  for (const lateMinutes of ['', '-1', '0.5', '1441', 'Infinity']) assert.throws(() => normalizeAttendancePolicyDraft({ ...draft, lateMinutes }, publicPolicy), isCode('validation'));
  assert.throws(() => normalizeAttendancePolicyDraft({ ...draft, staffAttendanceSource: 'student' as 'teacher' }, publicPolicy), isCode('validation'));
});
test('policy save freshly merges all unrelated settings and preserves all Quran execution sources at teacher', async () => {
  const f = fixture(); const source = await f.api.loadPolicy();
  f.state.settings.registrationAcceptTemplate = 'NewestTemplate'; f.state.settings.maxSupervisorStudentPoints = 11;
  await f.api.savePolicy(source, { ...attendancePolicyDraft(source.policy), staffAttendanceSource: 'teacher', lateMinutes: '٦٠' });
  const write = f.calls.find(call => call.method === 'PUT')!.body!;
  assert.equal(write.registrationAcceptTemplate, 'NewestTemplate'); assert.equal(write.maxSupervisorStudentPoints, 11);
  for (const key of ['memorizationExecutionSource', 'reviewExecutionSource', 'linkExecutionSource', 'repeatExecutionSource', 'quranTaskExecutionSource']) assert.equal(write[key], 'teacher');
  assert.equal(write.familyPointsAddToStudents, true); assert.equal(write.attendanceAccountEnabled, true); assert.equal(write.automaticExecutionMessageEnabled, true);
  assert.equal(write.staffAttendanceLocationUrl, 'fixture-location'); assert.equal(write.staffAttendanceLocationLat, 26.4);
  assert.equal(write.quranReferenceMode, 'page'); assert.equal(write.staffAttendanceLateAfterAsrMinutes, 60);
  assert.deepEqual(f.calls.map(call => [call.path, call.method]), [['/settings', 'GET'], ['/settings', 'GET'], ['/settings', 'PUT']]);
});
test('student responsible policy follows the existing manual/message toggles without changing Quran execution policy', async () => {
  const f = fixture(); const source = await f.api.loadPolicy();
  await f.api.savePolicy(source, { ...attendancePolicyDraft(source.policy), recitationAttendanceSource: 'teacher' });
  assert.equal(f.state.settings.attendanceManualEnabled, false); assert.equal(f.state.settings.automaticExecutionMessageEnabled, false);
  assert.equal(f.state.settings.memorizationExecutionSource, 'teacher'); assert.equal(f.state.settings.quranTaskExecutionSource, 'teacher');
  const fresh = await f.api.loadPolicy(); await f.api.savePolicy(fresh, { ...attendancePolicyDraft(fresh.policy), recitationAttendanceSource: 'supervisor' });
  assert.equal(f.state.settings.attendanceManualEnabled, true); assert.equal(f.state.settings.automaticExecutionMessageEnabled, false);
});
test('fresh policy comparison rejects concurrent policy/day/holiday changes with no PUT while unrelated changes remain mergeable', async () => {
  for (const change of [{ staffAttendanceLateAfterAsrMinutes: 51 }, { attendanceAccountEnabled: false },
    { recitationSessionDays: [0, 3] }, { seasonalHolidays: [{ startDate: sessionDate, endDate: sessionDate }] }]) {
    const f = fixture(); const source = await f.api.loadPolicy(); Object.assign(f.state.settings, change);
    await assert.rejects(f.api.savePolicy(source, attendancePolicyDraft(source.policy)), isCode('conflict')); assert.equal(f.calls.some(call => call.method === 'PUT'), false);
  }
});
test('invalid policy input and missing settings grant are refused before fetching or writing settings', async () => {
  const f = fixture(); const source = await f.api.loadPolicy(); const count = f.calls.length;
  await assert.rejects(f.api.savePolicy(source, { ...attendancePolicyDraft(source.policy), lateMinutes: '0.5' }), isCode('validation')); assert.equal(f.calls.length, count);
  const limited = fixture({ ...administrator, dashboardPermissions: ['manualAttendance', 'reports'] }); assert.equal(limited.api.canEditPolicy(), false);
  await assert.rejects(limited.api.loadPolicy(), isCode('forbidden')); await assert.rejects(limited.api.savePolicy(source, attendancePolicyDraft(source.policy)), isCode('forbidden'));
  assert.equal(limited.calls.length, 0);
});
test('settings grant and identity are checked again after both policy GET and PUT responses', async () => {
  const read = fixture(administrator, call => { if (call.path === '/settings') read.change({ ...administrator, dashboardPermissions: ['manualAttendance', 'reports'] }); });
  await assert.rejects(read.api.loadPolicy(), isCode('forbidden'));
  for (const phase of ['GET', 'PUT']) {
    let armed = false; const f = fixture(administrator, call => {
      if (armed && call.path === '/settings' && call.method === phase) f.change({ ...administrator, id: 9 });
    });
    const source = await f.api.loadPolicy(); armed = true;
    await assert.rejects(f.api.savePolicy(source, attendancePolicyDraft(source.policy)), isCode('cancelled'));
    assert.equal(f.calls.filter(call => call.method === 'PUT').length, phase === 'PUT' ? 1 : 0);
  }
});
test('lost policy response locks settings writes and roster mutations until successful reconciliation', async () => {
  let loseReply = true; const f = fixture(manager, (call, state) => {
    if (call.method === 'PUT' && loseReply) { state.settings = { ...call.body }; state.policy = { ...state.settings }; loseReply = false; throw new NativeApiError('timeout'); }
  });
  const data = await f.api.load(query()); const source = await f.api.loadPolicy(); const draft = { ...attendancePolicyDraft(source.policy), lateMinutes: '65' };
  await assert.rejects(f.api.savePolicy(source, draft), isCode('timeout')); await assert.rejects(f.api.savePolicy(source, draft), isCode('conflict'));
  await assert.rejects(f.api.saveAttendance(data, [data.rows[0]!], 'present'), isCode('conflict')); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
  const fresh = await f.api.load(query()); assert.equal(fresh.policy.staffAttendanceLateAfterAsrMinutes, 65); assert.equal(f.api.canSet(fresh, fresh.rows[0]!), true);
  const reconciled = await f.api.loadPolicy(); await f.api.savePolicy(reconciled, attendancePolicyDraft(reconciled.policy)); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 2);
});
test('mismatched policy acknowledgement becomes uncertain instead of falsely reporting a saved policy', async () => {
  const f = fixture(manager, (call, state) => call.method === 'PUT' ? state.settings : undefined); const source = await f.api.loadPolicy();
  await assert.rejects(f.api.savePolicy(source, { ...attendancePolicyDraft(source.policy), lateMinutes: '75' }), isCode('invalid-response'));
  await assert.rejects(f.api.savePolicy(source, attendancePolicyDraft(source.policy)), isCode('conflict'));
});
