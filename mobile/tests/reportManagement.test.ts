import assert from 'node:assert/strict';
import test from 'node:test';
import { reportRange } from '../../src/lib/reportPeriods.js';
import { canReadStandardReports, decodeGradingSessions, decodeReportArchive, decodeReportOverview, decodeReportTable,
  decodeTeacherPoints, normalizeReportQuery, reportGrants, reportPeriodRange, reportQueryKey, reportSnapshot,
  type ReportManagementQuery } from '../src/domain/reportManagement';
import type { NativeSession, NativeSessionController, NativeSessionSnapshot } from '../src/domain/nativeSession';
import { createReportManagementApi } from '../src/services/reportManagementApi';
import { NativeApiError } from '../src/services/nativeApi';

const from = '2026-10-11', to = '2026-10-14';
const manager: NativeSession = { role: 'manager', id: 8, name: 'FixtureManager', dashboardPermissions: [],
  complex: { registrationNumber: 'native-report-fixture', name: 'Fixture' } };
const administrator: NativeSession = { ...manager, role: 'admin', dashboardPermissions: ['reports'] };
const supervisor: NativeSession = { ...manager, role: 'supervisor', dashboardPermissions: [] };
const query = (patch: Partial<ReportManagementQuery> = {}): ReportManagementQuery => ({ from, to, committeeId: 'all', complexId: 'all', ...patch });
const isCode = (code: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === code;
const publicSettings = { reportsSectionEnabled: true, teacherManualPointsEnabled: false, attendanceManualEnabled: true,
  attendanceAccountEnabled: true, recitationAttendanceSource: 'supervisor', staffAttendanceSource: 'supervisor',
  staffAttendanceLateAfterAsrMinutes: 50, recitationSessionDays: [0, 1, 2, 3, 4], seasonalHolidays: [] };
const period = { from, to, committeeId: 'all', committeeName: 'كل الحلقات' };
const circleRows = [{ id: 3, name: 'RepeatedCircle', complexId: 4 }, { id: 5, name: 'RepeatedCircle', complexId: 6 }, { id: 7, name: 'AnotherCircle', complexId: 4 }];
const segments = { tested: 1, total: 3, compensated: 1, mistakes: 2, warnings: 3, hesitations: 4, grade: '8.5', max: '10' };
const gradeRow = { id: 1, name: 'FixturePupil', committeeName: 'RepeatedCircle', grade: '8.5', max: '10', percentage: '85', recordedWeeks: 1,
  attended: 1, absent: 0, late: 0, excused: 1, segments };
const teacher = { id: 12, name: 'FixtureTutor', committees: 'RepeatedCircle', attendance: { attended: 1, late: 0, absent: 0, excused: 1, expected: 2, percentage: 100 },
  achievement: { completed: 3, expected: 4, percentage: 75 } };
function overview(range = { from, to }) {
  return { period: { ...period, ...range }, totals: { studentsCount: 3, familiesCount: 1, supervisorsCount: 2, studentPoints: 14, familyPoints: 2,
    quranFaces: { memorization: 40.75, link: 20.5, review: 12, repeat: 0 } }, grades: {
    weeklyProgram: { grade: 75, max: 100, percentage: 75, students: 1, studentsList: [{ ...gradeRow, attendanceDays: 2, expectedWeeks: 1 }] },
    weeklySession: { grade: '8.5', max: 10, percentage: 85, recorded: 1, attended: 1, absent: 0, late: 0, excused: 1, expectedAttendance: 2,
      committees: [{ id: 3, name: 'RepeatedCircle', grade: 8.5, max: 10, percentage: 85 }], studentsList: [gradeRow] },
    trackSession: { grade: 8.5, max: 10, percentage: 85, segments, committees: [], studentsList: [gradeRow] },
    reading: { expectedDays: 2, expectedByStudent: { '1': 2 }, days: 1, hizbs: 0.5, byStudent: { '1': { days: 1, faces: 10, hizbs: 0.5 } } },
    narration: { grade: 3, students: 1, studentsList: [{ id: 1, name: 'FixturePupil', committeeName: 'RepeatedCircle', grade: 3, times: 1 }] },
    compensations: [{ id: 9, studentId: 1, date: to, scope: 'track', cancelledAt: null }] },
    attendance: { students: { present: 1, late: 1, excused: 1, absent: 0, total: 3, notRecorded: 0 }, supervisors: { present: 1, late: 0, excused: 0, absent: 0, total: 1 } },
    points: { transactionsCount: 2, activeStudents: 1, increasePoints: 16, deductionPoints: 2, netPoints: 14 },
    families: { familiesWithStudents: 1, emptyFamilies: 0, averageStudentsPerFamily: 3 },
    committeeIndicators: [{ id: 3, name: 'RepeatedCircle', studentsCount: 1, metrics: { memorization: { done: 3, total: 4, percentage: 75 } }, overallPercentage: 75,
      students: [{ id: 1, name: 'FixturePupil', metrics: { memorization: { done: 3, total: 4 } }, overallPercentage: 75 }] }],
    planPerformance: { series: [{ date: to, done: 0, expected: 0, percentage: null, components: { memorization: { done: 0, expected: 0 } }, shortageFaces: 0, aheadFaces: 0 }],
      students: [{ studentId: 1, series: [{ date: to, done: 3, expected: 4, percentage: 75, components: { review: { done: 3, expected: 4 } } }] }] },
    studentLevels: [{ id: 1, name: 'FixturePupil', committeeName: 'RepeatedCircle', level: { key: 'level-1', name: 'المستوى الأول', progressPercent: 45, finished: false }, since: from, days: 4 }],
    branchPassing: { expected: 1, tested: 1, percentage: 100, studentsList: [{ id: 1, name: 'FixturePupil', committeeName: 'RepeatedCircle', tested: true, juzNumbers: [1, 2] }] },
    bestStudents: [{ id: 1, name: 'FixturePupil', committeeId: 3, committeeName: 'RepeatedCircle', grade: 86.5, percentage: null }], bestCommittees: [], bestComplexes: [], teachers: [teacher],
    quranLeaders: { memorization: [{ id: 1, name: 'FixturePupil', faces: 40.75 }] } };
}
function storedArchive() { return { id: 20, title: 'FixtureArchive', periodFrom: from, periodTo: to, createdAt: '2026-10-14 15:30',
  period: { ...period }, overviewReport: overview(), progressReport: { period, rows: [{ id: 1, name: 'FixturePupil', saved: '40.75', executionTotals: { memorization: 20.5 } }] } }; }
interface Call { path: string; method: string; signal?: AbortSignal }
interface State { public: Record<string, unknown>; archive: Record<string, unknown> | null; overview: ReturnType<typeof overview>;
  circles: typeof circleRows; balances: { id: number; name: string; points: number; committeeId: number; committeeName: string }[] }
function fixture(actor = manager, handle?: (call: Call, state: State) => unknown | Promise<unknown>) {
  let identity: NativeSession | null = actor;
  const calls: Call[] = []; const state: State = { public: structuredClone(publicSettings), archive: storedArchive(), overview: overview(),
    circles: structuredClone(circleRows), balances: circleRows.map((circle, index) => ({ id: index + 1, name: `FixturePupil${index + 1}`, points: 14 + index, committeeId: circle.id, committeeName: circle.name })) };
  const controller: NativeSessionController = {
    getSnapshot: (): NativeSessionSnapshot => ({ status: identity ? 'authenticated' : 'signed-out', session: identity, error: null }),
    subscribe: () => () => {}, login: async () => {}, restore: async () => {}, cancel: () => {},
    logout: async () => { identity = null; return { localCleared: true, serverRevoked: true, error: null }; },
    async request<T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (body: unknown) => T): Promise<T> {
      const call: Call = { path, method: options?.method ?? 'GET', signal: options?.signal }; calls.push(call);
      let body = await handle?.(call, state);
      const url = new URL(path, 'http://fixture.invalid'); const range = { from: url.searchParams.get('from') ?? from, to: url.searchParams.get('to') ?? to };
      if (body === undefined) {
        if (path === '/public-settings') body = state.public;
        else if (path === '/reports/archives') body = state.archive ? [state.archive] : [];
        else if (url.pathname === '/reports/archives/20') {
          if (!state.archive) throw new NativeApiError('not-found', 404);
          if (call.method === 'DELETE') { state.archive = null; body = { ok: true }; } else body = state.archive;
        } else if (path === '/reports/committees') body = state.circles;
        else if (path === '/complexes') body = [{ id: 4, name: 'ComplexA' }, { id: 6, name: 'ComplexB' }];
        else if (url.pathname === '/reports/overview') body = { ...state.overview, period: { ...period, ...range } };
        else if (url.pathname === '/reports/teacher-points') body = { period: range, rows: [{ id: 2, studentId: 1, studentName: 'FixturePupil', committeeName: 'RepeatedCircle', type: 'deduction', points: '2', reason: 'FixtureReason', transactionDate: range.to, teacherName: 'FixtureTutor' }] };
        else if (url.pathname === '/reports/student-points' || path === '/students') body = state.balances.filter(row => !url.searchParams.has('committeeId') || row.committeeId === Number(url.searchParams.get('committeeId')));
        else if (url.pathname === '/reports/grading-sessions') body = { period: range, rows: [gradeRow], compensations: [{ id: 9, studentId: 1, date: range.to, scope: 'track' }] };
        else if (url.pathname === '/reports/supervisors') body = [{ id: Number(url.searchParams.get('staffId') ?? 12), name: 'FixtureTutor', role: 'supervisor', recordDate: range.to, status: 'excused', checkInTime: null }];
        else if (url.pathname === '/reports/students') body = [{ id: 1, name: 'FixturePupil', loginNumber: '940001', committeeName: 'RepeatedCircle', status: null, checkInTime: null, recordDate: null }];
        else if (url.pathname === '/reports/progress') body = { period: range, rows: [{ id: 1, name: 'FixturePupil', tasks: { memorization: { done: 1, expected: 2, details: [{ date: range.to, done: true, amount: '0.5' }] } }, saved: '40.75', executionTotals: { memorization: 20.5 } }] };
        else if (url.pathname === '/reports/recitation-sessions') body = { period: range, rows: [{ id: 1, studentId: 1, studentName: 'FixturePupil', teacherName: 'FixtureTutor', attemptNumber: 2, evaluationScore: 8.5, evaluationMaxScore: 10, ayahMarks: [{ ayah: 1, type: 'mistake' }], wordMarks: [], marksFromPreviousAttempt: true }] };
        else if (url.pathname === '/reports/student-saved') body = { period: { ...range, mode: 'range' }, rows: [{ id: '1:page:2:10', studentId: 1, studentName: 'FixturePupil', totalFaces: 40.75, displayRange: 'من الصفحة 2 إلى 10', ranges: [{ startPage: 2, endPage: 10, pagesCount: 9 }] }] };
        else throw new Error(`Unexpected fixture route: ${url.pathname}`);
      }
      return decode ? decode(structuredClone(body)) : structuredClone(body) as T;
    },
  };
  return { controller, api: createReportManagementApi(controller), calls, state, change: (next: NativeSession | null) => { identity = next; } };
}
function deferred() { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() }; }
const expectedArchive = () => decodeReportArchive(storedArchive(), 20);

test('periods reuse the website Hijri month/quarter/year and Sunday week rules', () => {
  for (const period of ['week', 'month', 'quarter', 'year', 'custom'] as const) assert.deepEqual(reportPeriodRange(period, { from, to }, to), reportRange(period, { from, to }, to));
  assert.equal(reportPeriodRange('week', {}, to).from, from);
  assert.deepEqual(reportPeriodRange('custom', { from: '٢٠٢٦-١٠-١١', to: '۲۰۲۶-۱۰-۱۴' }, to), { from, to });
  assert.throws(() => reportPeriodRange('custom', { from: '٢٠٢٦-٠٢-٣٠', to }, to), isCode('validation'));
  assert.throws(() => reportPeriodRange('month', {}, '2026-02-30'), isCode('validation'));
});
test('report queries normalize digits, bind every filter, and do not invent the attendance 366-day cap', () => {
  assert.equal(normalizeReportQuery(query({ from: '٢٠٢٦-١٠-١١', to: '۲۰۲۶-۱۰-۱۴' })).to, to);
  assert.equal(normalizeReportQuery(query({ from: '2024-01-01', to: '2026-10-14' })).from, '2024-01-01');
  assert.notEqual(reportQueryKey(query()), reportQueryKey(query({ reportType: 'weekly' })));
  assert.notEqual(reportQueryKey(query(), 'a'), reportQueryKey(query(), 'b'));
  assert.deepEqual(normalizeReportQuery(query({ archiveId: 20, committeeId: 3, complexId: 4 })), query({ reportType: 'overview', archiveId: 20 }));
});
test('invalid dates, reverse periods, scope IDs and detail kinds fail before outbound traffic', async () => {
  const f = fixture();
  for (const patch of [{ from: '2026-02-30' }, { from: '2026-10-15' }, { committeeId: 0 }, { complexId: 1.5 }, { archiveId: -1 }, { complexId: Number.MAX_SAFE_INTEGER + 1 }]) await assert.rejects(f.api.load(query(patch)), isCode('validation'));
  assert.throws(() => normalizeReportQuery({ ...query(), from: null } as unknown as ReportManagementQuery), isCode('validation'));
  assert.throws(() => normalizeReportQuery({ ...query(), reportType: 'invented' } as unknown as ReportManagementQuery), isCode('validation'));
  assert.equal(f.calls.length, 0);
});
test('standard reports grants remain separate from weekly/track writer grants and legacy grades', () => {
  assert.equal(canReadStandardReports(supervisor), true); assert.equal(canReadStandardReports(administrator), true);
  for (const grants of [[], ['weeklySession'], ['trackSession'], ['weeklySession', 'trackSession'], ['grades'], ['teacherPoints']]) {
    const session = { ...administrator, dashboardPermissions: grants }; assert.equal(canReadStandardReports(session), false);
    assert.throws(() => fixture(session), isCode('forbidden'));
  }
  assert.throws(() => fixture({ ...manager, role: 'student', dashboardPermissions: ['reports'] }), isCode('forbidden'));
  assert.equal(reportGrants(administrator, publicSettings).weeklySession, true);
});
test('manager reader uses real flags, freezes its query/report and avoids private settings and unrelated report readers', async () => {
  const f = fixture(); const data = await f.api.load(query());
  assert.equal(data.overview?.totals?.studentPoints, 14); assert.equal(data.actor.role, 'manager');
  assert.equal(Object.isFrozen(data), true); assert.equal(Object.isFrozen(data.overview?.grades?.trackSession?.segments), true);
  assert.equal(data.queryKey, f.api.queryKey(query())); assert.equal(data.teacherPoints, null);
  assert.deepEqual(f.calls.map(call => new URL(call.path, 'http://fixture.invalid').pathname), ['/public-settings', '/reports/archives', '/reports/committees', '/complexes', '/reports/overview']);
});
test('the manager report flag is a client policy guard; the supervisor own-report portal keeps its existing exception', async () => {
  const f = fixture(); f.state.public.reportsSectionEnabled = false;
  await assert.rejects(f.api.load(query()), isCode('forbidden')); assert.deepEqual(f.calls.map(c => c.path), ['/public-settings']);
  const own = fixture(supervisor); own.state.public.reportsSectionEnabled = false; const data = await own.api.load(query());
  assert.equal(data.grants.teacherScoped, true); assert.equal(data.grants.canManageArchives, false);
  assert.deepEqual(own.calls.map(c => new URL(c.path, 'http://fixture.invalid').pathname), ['/public-settings', '/reports/overview']);
});
test('teacher point history follows its real feature flag and exact period/scope rather than a writer grant', async () => {
  const f = fixture(administrator); f.state.public.teacherManualPointsEnabled = true;
  const data = await f.api.load(query({ committeeId: 3, complexId: 4 })); assert.equal(data.teacherPoints?.rows[0]?.points, 2);
  const request = f.calls.find(c => c.path.startsWith('/reports/teacher-points?'))!;
  assert.equal(new URL(request.path, 'http://fixture.invalid').searchParams.get('complexId'), '4');
  assert.equal(data.grants.canViewTeacherPoints, true);
});
test('overview decoder preserves SQL decimals, neutral no-denominator values, task faces and history fields', () => {
  const value = decodeReportOverview(overview(), { from, to });
  assert.equal(value.grades?.trackSession?.segments?.grade, 8.5); assert.equal(value.grades?.weeklySession?.percentage, 85);
  assert.equal(value.totals?.quranFaces?.memorization, 40.75); assert.equal(value.planPerformance?.series[0]?.percentage, null);
  assert.equal(value.planPerformance?.students[0]?.studentId, 1); assert.equal(value.planPerformance?.students[0]?.name, undefined);
  assert.equal(value.bestStudents?.[0]?.percentage, null); assert.equal(value.studentLevels?.[0]?.level.progressPercent, 45);
});
test('legacy snapshots retain missing components/totals/levels instead of fabricated zero metrics', () => {
  const legacy = decodeReportOverview({ grades: { weeklySession: { grade: 0 } } });
  assert.equal(legacy.totals, undefined); assert.equal(legacy.grades?.trackSession, undefined); assert.equal(legacy.studentLevels, undefined);
  assert.equal(legacy.grades?.weeklySession?.grade, 0); assert.equal(legacy.grades?.weeklySession?.max, undefined);
  assert.throws(() => decodeReportOverview(overview(), { from: '2026-10-12', to }), isCode('invalid-response'));
  assert.throws(() => decodeReportOverview({ grades: {} }, { from, to }), isCode('invalid-response'));
});
test('malformed numeric and report dates are rejected without accepting booleans or noncanonical SQL serialization', () => {
  for (const grade of [true, '', '1e3', Number.NaN]) {
    const raw = overview(); raw.grades.weeklySession.grade = grade as unknown as string;
    assert.throws(() => decodeReportOverview(raw, { from, to }), isCode('invalid-response'));
  }
  for (const recordDate of ['2026-02-30', '2026-10-13T21:00:00Z', '2026-02-30T21:00:00.000Z']) assert.throws(() => decodeReportTable([{ id: 1, recordDate }]), isCode('invalid-response'));
  assert.throws(() => decodeReportTable([{ id: 1, name: { malformed: true } }]), isCode('invalid-response'));
  assert.throws(() => decodeReportTable({ period: false, rows: [] }), isCode('invalid-response'));
});
test('detail progress/saved/recitation readers preserve nested typed JSON and composite saved identities', async () => {
  for (const reportType of ['progress', 'saved', 'recitations'] as const) {
    const f = fixture(); const data = await f.api.load(query({ reportType })); assert.equal(data.overview, null); assert.equal(data.detail?.rows.length, 1);
    assert.equal(f.calls.some(c => c.path.startsWith('/reports/overview')), false); assert.equal(data.detail?.period?.from, from);
    if (reportType === 'saved') { assert.equal(data.detail?.rows[0]?.id, '1:page:2:10'); assert.equal(data.detail?.rows[0]?.totalFaces, 40.75); }
    if (reportType === 'recitations') { assert.equal(data.detail?.rows[0]?.attemptNumber, 2); assert.equal(data.detail?.rows[0]?.evaluationScore, 8.5); }
    if (reportType === 'progress') { assert.equal(data.detail?.rows[0]?.saved, '40.75'); assert.deepEqual(data.detail?.rows[0]?.executionTotals, { memorization: 20.5 }); }
  }
});
test('all-time saved snapshots retain their empty start and range identity without interpreting them as current live data', () => {
  const value = decodeReportTable({ period: { from: '', to, mode: 'allTime' }, rows: [{ id: '1:ayah:1:7', studentId: 1, totalFaces: 0.75 }] });
  assert.equal(value.period?.from, ''); assert.equal(value.period?.mode, 'allTime'); assert.equal(value.rows[0]?.id, '1:ayah:1:7');
});
test('student attendance is the effective daily report at query.to, with strict Riyadh SQL DATE mapping', async () => {
  const f = fixture(manager, call => call.path.startsWith('/reports/students?') ? [{ id: 1, name: 'FixturePupil', loginNumber: '940001', committeeName: 'RepeatedCircle', status: 'late', checkInTime: null, recordDate: '2026-10-13T21:00:00.000Z' }] : undefined);
  const data = await f.api.load(query({ reportType: 'students' })); assert.equal(data.detail?.effectiveDate, to); assert.equal(data.detail?.rows[0]?.recordDate, to);
  assert.equal(data.detail?.period, undefined); assert.ok(f.calls.some(c => c.path === '/reports/students?date=2026-10-14&committeeId=all'));
});
test('student report non-session date displays its previous configured session and rejects a wrong SQL civil day', async () => {
  const f = fixture(); const value = await f.api.load(query({ to: '2026-10-17', reportType: 'students' }));
  assert.equal(value.detail?.requestedDate, '2026-10-17'); assert.equal(value.detail?.effectiveDate, '2026-10-15');
  const invalid = fixture(manager, c => c.path.startsWith('/reports/students?') ? [{ id: 1, name: 'FixturePupil', recordDate: '2026-10-14T21:00:00.000Z', status: 'late' }] : undefined);
  await assert.rejects(invalid.api.load(query({ reportType: 'students' })), isCode('invalid-response'));
});
test('reports-only reader can read both grading components but one request selects only the requested component', async () => {
  const f = fixture(administrator); const weekly = await f.api.loadGradingSessions({ from, to, committeeId: 'all', component: 'weekly' });
  assert.equal(weekly.rows[0]?.grade, 8.5); assert.equal(weekly.rows[0]?.segments.compensated, 1);
  assert.ok(f.calls.some(c => c.path.endsWith('&component=weekly'))); assert.equal(f.calls.some(c => c.path.includes('component=track')), false);
  const data = await f.api.load(query({ reportType: 'track' })); assert.equal(data.detail?.rows[0]?.recordedWeeks, 1); assert.equal(data.grants.trackSession, true);
});
test('grading zero remains a recorded numeric zero and malformed/incomplete segments cannot become a successful report', () => {
  const raw = { period, rows: [{ ...gradeRow, grade: 0, percentage: 0, segments: { ...segments, grade: 0 } }], compensations: [] };
  assert.equal(decodeGradingSessions(raw, { from, to }).rows[0]?.grade, 0);
  assert.throws(() => decodeGradingSessions({ ...raw, rows: [{ ...raw.rows[0], segments: { grade: 0 } }] }, { from, to }), isCode('invalid-response'));
  assert.throws(() => decodeGradingSessions({ ...raw, period: { from, to: '2026-10-15' } }, { from, to }), isCode('invalid-response'));
});
test('complex-only detail filters fan out by circle IDs and preserve scope despite duplicated names', async () => {
  const f = fixture(manager, call => { if (call.path.startsWith('/reports/progress?')) { const circleId = Number(new URL(call.path, 'http://fixture.invalid').searchParams.get('committeeId')); return { period, rows: [{ id: circleId, name: 'FixturePupil', saved: '20.5' }] }; } });
  const data = await f.api.load(query({ complexId: 4, reportType: 'progress' }));
  assert.equal(data.detail?.rows.length, 2); const calls = f.calls.filter(c => c.path.startsWith('/reports/progress?'));
  assert.deepEqual(calls.map(c => new URL(c.path, 'http://fixture.invalid').searchParams.get('committeeId')), ['3', '7']);
  assert.equal(data.query.complexId, 4); assert.equal(data.queryKey, f.api.queryKey(query({ complexId: 4, reportType: 'progress' })));
  await assert.rejects(f.api.load(query({ complexId: 4, committeeId: 5, reportType: 'saved' })), isCode('validation'));
});
test('complex grading fanout keeps each pupil once and refuses repeated identities in aggregate readers', async () => {
  const f = fixture(manager, call => { if (call.path.startsWith('/reports/grading-sessions?')) { const id = Number(new URL(call.path, 'http://fixture.invalid').searchParams.get('committeeId')); return { period, rows: [{ ...gradeRow, id }], compensations: [] }; } });
  const data = await f.api.load(query({ reportType: 'track', complexId: 4 })); assert.deepEqual(data.detail?.rows.map(row => row.id), [3, 7]);
  const invalid = fixture();
  for (const reportType of ['track', 'students', 'progress'] as const) await assert.rejects(invalid.api.load(query({ reportType, complexId: 4 })), isCode('invalid-response'));
});
test('balance fanout is current scoped balance, not dated transaction history; duplicates fail verification', async () => {
  const f = fixture(); const rows = await f.api.loadStudentPoints({ committeeId: 'all', complexId: 4 }); assert.deepEqual(rows.map(r => r.id), [1, 3]);
  assert.equal(f.calls.some(c => c.path.includes('/reports/points')), false);
  const duplicate = fixture(manager, c => c.path.startsWith('/reports/student-points?') ? [{ id: 1, name: 'FixturePupil', points: 14, committeeId: 3, committeeName: 'RepeatedCircle' }] : undefined);
  await assert.rejects(duplicate.api.loadStudentPoints({ committeeId: 'all', complexId: 4 }), isCode('invalid-response'));
});
test('supervisor balance reader uses the scoped privacy-limited student roster and never legacy unscoped point APIs', async () => {
  const f = fixture(supervisor); const rows = await f.api.loadStudentPoints({ committeeId: 'all', complexId: 4 }); assert.deepEqual(rows.map(r => r.id), [1, 3]);
  assert.ok(f.calls.some(c => c.path === '/students'));
  assert.equal(f.calls.some(c => c.path.startsWith('/reports/student-points') || c.path.startsWith('/reports/points') || c.path === '/complexes' || c.path === '/reports/archives'), false);
});
test('staff date ranges use the real array contract and scope filtering resolves staff IDs through scoped overview', async () => {
  const f = fixture(); const data = await f.api.load(query({ reportType: 'supervisors', committeeId: 3, complexId: 4 })); assert.equal(data.detail?.rows[0]?.id, 12);
  assert.ok(f.calls.some(c => c.path === '/reports/supervisors?from=2026-10-11&to=2026-10-14&staffId=12'));
  assert.ok(f.calls.some(c => c.path.startsWith('/reports/overview?') && c.path.endsWith('complexId=4')));
  const own = fixture(supervisor); await own.api.load(query({ reportType: 'supervisors' }));
  assert.ok(own.calls.some(c => c.path.endsWith('&staffId=8'))); assert.equal(own.calls.some(c => c.path.startsWith('/reports/overview?')), false);
});
test('archive is a stored snapshot with no live report fallback, no live metadata/history fetch and explicit null overview', async () => {
  const f = fixture(); f.state.archive!.overviewReport = null;
  const data = await f.api.load(query({ archiveId: 20, reportType: 'saved' })); assert.equal(data.archive?.overviewReport, null); assert.equal(data.overview, null);
  assert.equal(data.archive?.progressReport.rows[0]?.saved, '40.75');
  assert.deepEqual(f.calls.map(c => c.path), ['/public-settings', '/reports/archives', '/reports/archives/20']);
});
test('supervisor archive reads and deletion are forbidden before traffic even with a reports grant', async () => {
  const f = fixture({ ...supervisor, dashboardPermissions: ['reports'] });
  await assert.rejects(f.api.load(query({ archiveId: 20 })), isCode('forbidden'));
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('forbidden')); assert.equal(f.calls.length, 0);
});
test('archive snapshot compares every stored field, validates record/period identity and rejects malformed timestamps', () => {
  const raw = storedArchive(); const archive = decodeReportArchive({ ...raw, futureField: { value: 1 } }, 20);
  assert.notEqual(archive.snapshot, reportSnapshot(raw)); assert.equal(reportSnapshot({ b: 1, a: 2 }), reportSnapshot({ a: 2, b: 1 }));
  for (const patch of [{ id: 21 }, { createdAt: '2026-02-30 10:00' }, { createdAt: '2026-10-14 24:00' }, { periodFrom: '2026-10-10' }]) assert.throws(() => decodeReportArchive({ ...raw, ...patch }, 20), isCode('invalid-response'));
});
test('archive deletion freshly compares before DELETE and verifies both list absence and an authorized detail 404', async () => {
  const f = fixture(); const result = await f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }); assert.deepEqual(result, { verified: true, id: 20 });
  assert.deepEqual(f.calls.map(c => `${c.method} ${c.path}`), ['GET /public-settings', 'GET /reports/archives/20', 'DELETE /reports/archives/20', 'GET /reports/archives', 'GET /reports/archives/20']);
  assert.equal(f.api.hasUncertainOperation(), false);
});
test('stale archive changes abort before DELETE, including unknown fields retained by the snapshot', async () => {
  const f = fixture(); f.state.archive!.futureField = { changed: true };
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('conflict'));
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0); assert.equal(f.api.hasUncertainOperation(), false);
});
test('lost DELETE response blocks duplicate writes across factories until fresh list plus authorized 404 reconciles', async () => {
  const f = fixture(manager, (call, state) => { if (call.method === 'DELETE') { state.archive = null; throw new NativeApiError('network'); } });
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('network')); assert.equal(f.api.hasUncertainOperation(), true);
  const api = createReportManagementApi(f.controller); const before = f.calls.length;
  await assert.rejects(api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('conflict')); assert.equal(f.calls.length, before);
  const data = await api.load(query({ archiveId: 20 })); assert.equal(data.reconciledArchiveDeletion, 20); assert.equal(data.query.archiveId, undefined); assert.equal(data.archive, null);
  assert.equal(data.queryKey, api.queryKey(query())); assert.equal(api.hasUncertainOperation(), false); assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
});
test('uncertain archive must not reconcile from list absence alone when detail read fails or still exists', async () => {
  let failDetail = false;
  const f = fixture(manager, (call, state) => { if (call.method === 'DELETE') { state.archive = null; throw new NativeApiError('network'); }
    if (failDetail && call.path === '/reports/archives/20') throw new NativeApiError('server', 503); });
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('network')); failDetail = true;
  await assert.rejects(f.api.load(query()), isCode('server')); assert.equal(f.api.hasUncertainOperation(), true);
  failDetail = false; f.state.archive = storedArchive(); await assert.rejects(f.api.load(query()), isCode('conflict')); assert.equal(f.api.hasUncertainOperation(), true);
});
test('known HTTP mutation rejection permits retry while invalid success/verification failures remain uncertain', async () => {
  const rejected = fixture(manager, call => { if (call.method === 'DELETE') throw new NativeApiError('forbidden', 403); });
  await assert.rejects(rejected.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('forbidden')); assert.equal(rejected.api.hasUncertainOperation(), false);
  const badAck = fixture(manager, call => call.method === 'DELETE' ? { ok: false } : undefined);
  await assert.rejects(badAck.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('invalid-response')); assert.equal(badAck.api.hasUncertainOperation(), true);
  const noCommit = fixture(manager, call => call.method === 'DELETE' ? { ok: true } : undefined);
  await assert.rejects(noCommit.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('invalid-response')); assert.equal(noCommit.api.hasUncertainOperation(), true);
});
test('in-flight deletion rejects another write and read before extra network traffic', async () => {
  const gate = deferred(); const entered = deferred();
  const f = fixture(manager, async call => { if (call.method === 'DELETE') { entered.resolve(); await gate.promise; } });
  const work = f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }); await entered.promise; const count = f.calls.length;
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('conflict'));
  await assert.rejects(f.api.load(query()), isCode('conflict')); assert.equal(f.calls.length, count); gate.resolve(); await work;
});
test('role, actor and tenant identity changes before a request reject the stale service with zero reads', async () => {
  for (const next of [{ ...manager, id: 9 }, { ...manager, role: 'supervisor' as const }, { ...manager, complex: { ...manager.complex, registrationNumber: 'other-tenant' } }]) {
    const f = fixture(); f.change(next); await assert.rejects(f.api.load(query()), isCode('cancelled')); assert.equal(f.calls.length, 0);
    await assert.rejects(f.api.loadStudentPoints({ committeeId: 'all' }), isCode('cancelled')); assert.equal(f.calls.length, 0);
  }
  const signedOut = fixture(); signedOut.change(null); await assert.rejects(signedOut.api.load(query()), isCode('unauthorized')); assert.equal(signedOut.calls.length, 0);
});
test('a context change during public/private requests rejects after response and stops later dependent reads', async () => {
  for (const target of ['/public-settings', '/reports/overview']) {
    const f = fixture(manager, call => { if (call.path.startsWith(target)) f.change({ ...manager, id: 9 }); });
    await assert.rejects(f.api.load(query()), isCode('cancelled'));
    assert.equal(f.calls.filter(c => c.path.startsWith(target)).length, 1);
    if (target === '/public-settings') assert.equal(f.calls.length, 1);
  }
});
test('live standard-report grant revocation is enforced before and after reads and cannot clear an uncertain deletion', async () => {
  const before = fixture(administrator); before.change({ ...administrator, dashboardPermissions: ['weeklySession'] });
  await assert.rejects(before.api.load(query()), isCode('forbidden')); assert.equal(before.calls.length, 0);
  const during = fixture(administrator, call => { if (call.path.startsWith('/reports/overview')) during.change({ ...administrator, dashboardPermissions: [] }); });
  await assert.rejects(during.api.load(query()), isCode('forbidden'));
  const lost = fixture(administrator, (call, state) => { if (call.method === 'DELETE') { state.archive = null; throw new NativeApiError('network'); } });
  await assert.rejects(lost.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('network')); lost.change({ ...administrator, dashboardPermissions: [] });
  const count = lost.calls.length; await assert.rejects(lost.api.load(query()), isCode('forbidden')); assert.equal(lost.calls.length, count); assert.equal(lost.api.hasUncertainOperation(), true);
});
test('an actor switch after successful DELETE acknowledgment retains old-context uncertainty instead of declaring success', async () => {
  const f = fixture(manager, (call, state) => { if (call.method === 'DELETE') { state.archive = null; f.change({ ...manager, id: 9 }); return { ok: true }; } });
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('cancelled')); assert.equal(f.api.hasUncertainOperation(), true);
  assert.equal(f.calls.some(c => c.path === '/reports/archives'), false);
  f.change(manager); const data = await f.api.load(query()); assert.equal(data.reconciledArchiveDeletion, 20); assert.equal(f.api.hasUncertainOperation(), false);
});
test('a 404 after a tenant switch is not authorized evidence of deletion', async () => {
  let inspect = false;
  const f = fixture(manager, (call, state) => { if (call.method === 'DELETE') { state.archive = null; throw new NativeApiError('network'); }
    if (inspect && call.path === '/reports/archives/20') { f.change({ ...manager, complex: { ...manager.complex, registrationNumber: 'different' } }); throw new NativeApiError('not-found', 404); } });
  await assert.rejects(f.api.deleteArchive({ id: 20, expectedArchive: expectedArchive() }), isCode('network')); inspect = true;
  await assert.rejects(f.api.load(query()), isCode('cancelled')); assert.equal(f.api.hasUncertainOperation(), true);
});
test('API forwards cancellation signals and surfaces read failure without successful empty-report fabrication', async () => {
  const cancel = new AbortController(); const f = fixture(manager, call => { if (call.path.startsWith('/reports/progress')) throw new NativeApiError('server', 503); });
  await assert.rejects(f.api.load(query({ reportType: 'progress' }), cancel.signal), isCode('server')); assert.ok(f.calls.every(c => c.signal === cancel.signal));
});
test('teacher point rows reject foreign periods, impossible dates and unsupported transaction types', () => {
  const row = { id: 1, studentId: 1, studentName: 'FixturePupil', committeeName: null, type: 'increase', points: '14', reason: 'FixtureReason', transactionDate: to, teacherName: 'FixtureTutor' };
  assert.equal(decodeTeacherPoints({ period, rows: [row] }, { from, to }).rows[0]?.committeeName, '');
  for (const patch of [{ transactionDate: '2026-10-15' }, { transactionDate: '2026-02-30' }, { type: 'invented' }, { points: true }]) assert.throws(() => decodeTeacherPoints({ rows: [{ ...row, ...patch }] }, { from, to }), isCode('invalid-response'));
});
