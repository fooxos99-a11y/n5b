import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGradingPolicy } from '../../shared/grading-policy.js';
import { evaluateTrackSession, evaluateWeeklySession } from '../../shared/grading-engine.js';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { weekStartOf } from '../../src/components/dashboard/grades/gradesFormat.js';
import { createNativeSession, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createSessionManagementApi } from '../src/services/sessionManagementApi';
import { decodeSessionAttempt, decodeSessionPolicy, decodeSessionWeek, emptySessionSegmentDraft, filterSessionStudents,
  sessionAttendanceDeletesEvaluation, sessionAttendancePayload, sessionAttendancePreview, sessionEditable, sessionErrorCount,
  sessionRangeLabel, sessionSnapshot, sessionTested, sessionTestPreview, sessionTestSegments, type SessionComponent } from '../src/domain/sessionManagement';

const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [], complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }); const token = 'a'.repeat(64);
const isCode = (code: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === code;
const today = getBusinessDate(), weekStart = weekStartOf(today), weekEnd = shiftDateOnly(weekStart, 6);
const policy = normalizeGradingPolicy({ trackSession: { segments: [{ source: 'link', max: 10 }, { source: 'review', max: 10 }],
  mistakeDeduction: 5, warningDeduction: 1, hesitationDeduction: 0.5 } });
const ranges = [
  { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 3, fromSurahName: 'الفاتحة', toSurahName: 'الفاتحة' },
  { fromSurah: 1, fromAyah: 4, toSurah: 1, toAyah: 7, fromSurahName: 'الفاتحة', toSurahName: 'الفاتحة' },
];
const segments = () => ranges.map((range, index) => ({ index: index + 1, source: index ? 'review' : 'link', range, recorded: false, mistakes: 0, warnings: 0, hesitations: 0, grade: 0, max: 10 }));
const rawAttempt = () => ({ attemptToken: 'opaque_payload.opaque_signature', segments: segments().map(({ source, range, max }) => ({ source, range, max })) });
const rawStudent = (id = 2) => ({ id, name: id === 2 ? 'أحمد مُوسى' : 'طالب آخر', committeeId: 3, committeeName: 'حلقة', grade: {
  weeklySession: { grade: 0, max: 20, recorded: false }, weeklyDetail: null as unknown,
  trackSession: { grade: 0, max: 30, recorded: false }, trackDetail: null as unknown,
} });
const rawWeek = () => ({ weekStart, weekEnd, currentWeekStart: weekStart, periodStart: weekStart, periodEnd: weekEnd,
  hasPreviousWeek: true, seasonalHoliday: false, policy, maxima: { total: 100 }, students: [rawStudent(), rawStudent(5)] });
const week = (component: SessionComponent = 'track') => decodeSessionWeek(rawWeek(), component);
const preparedWeek = () => {
  const value = rawWeek(); const detail = evaluateTrackSession(policy, { attendanceStatus: 'present', segments: segments() });
  value.students[0]!.grade.trackDetail = { ...detail, attendanceRecorded: true };
  value.students[0]!.grade.trackSession = { grade: detail.grade, max: detail.max, recorded: true }; return value;
};
const testedWeek = () => {
  const value = preparedWeek(); const detail = evaluateTrackSession(policy, { attendanceStatus: 'present', segments: segments().map(segment => ({ ...segment, recorded: true })) });
  value.students[0]!.grade.trackDetail = { ...detail, attendanceRecorded: true };
  value.students[0]!.grade.trackSession = { grade: detail.grade, max: detail.max, recorded: true }; return value;
};
const circle = { id: 3, name: 'حلقة', complexId: 4, complexName: 'مجمع', points: 0, studentsCount: 2 };
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}

test('session decoding selects only the granted component and preserves saved attendance, ranges and pending segments', () => {
  const track = decodeSessionWeek(preparedWeek(), 'track'); assert.equal(track.component, 'track');
  assert.equal(track.students[0]!.detail!.attendanceStatus, 'present'); assert.equal(track.students[0]!.detail!.segments[1]!.source, 'review');
  assert.equal(track.students[0]!.detail!.segments[1]!.index, 2); assert.equal(track.students[0]!.detail!.segments[0]!.recorded, false);
  assert.equal(week('weekly').students[0]!.detail, null); assert.equal(week('weekly').students[0]!.grade.recorded, false);
});
test('session decoding rejects duplicate students, malformed policies, invalid dates and untrusted ranges', () => {
  for (const patch of [{ weekStart: '2026-02-30' }, { seasonalHoliday: 'false' }, { students: [rawStudent(), rawStudent()] },
    { policy: { trackSession: false } }, { students: [{ ...rawStudent(), id: 0 }] }]) {
    assert.throws(() => decodeSessionWeek({ ...rawWeek(), ...patch }, 'track'), isCode('invalid-response'));
  }
  assert.throws(() => decodeSessionPolicy({ ...policy, trackSession: { ...policy.trackSession, segmentCount: 'bad' } }), isCode('invalid-response'));
  const value = testedWeek(); const detail = value.students[0]!.grade.trackDetail as { segments: { range: unknown }[] };
  detail.segments[0]!.range = { fromSurah: 115, fromAyah: 1, toSurah: 115, toAyah: 2 };
  assert.throws(() => decodeSessionWeek(value, 'track'), isCode('invalid-response'));
});
test('legacy attended records retain attendance and missing attendance is never treated as present', () => {
  const value = rawWeek(); value.students[0]!.grade.weeklyDetail = { attended: false, grade: 0, max: 20 };
  assert.equal(decodeSessionWeek(value, 'weekly').students[0]!.detail!.attendanceStatus, 'absent');
  value.students[0]!.grade.weeklyDetail = { attended: true, attendanceRecorded: false, grade: 0, max: 20 };
  assert.equal(decodeSessionWeek(value, 'weekly').students[0]!.detail!.attendanceStatus, null);
});
test('seasonal holidays, future session periods and zero maxima disable editing', () => {
  const current = week('weekly'); assert.equal(sessionEditable(current, today), true);
  for (const patch of [{ periodStart: shiftDateOnly(today, 1) }, { weekStart: shiftDateOnly(today, 7) }, { seasonalHoliday: true }, { maximumTotal: 0 }]) {
    assert.equal(sessionEditable({ ...current, ...patch }, today), false);
  }
});
test('weekly attendance grades match the shared policy for full, zero, late and excused outcomes without fabricated test scores', () => {
  const current = week('weekly'), student = current.students[0]!;
  for (const status of ['present', 'late', 'excused', 'absent'] as const) {
    const preview = sessionAttendancePreview(current, student, status);
    assert.deepEqual(preview, evaluateWeeklySession(policy, { attendanceStatus: status }));
  }
  assert.equal(sessionAttendancePreview(current, student, 'present').grade, 20);
  assert.equal(sessionAttendancePreview(current, student, 'absent').grade, 0);
  assert.equal('segments' in sessionAttendancePayload(current, student, 'present'), false);
});
test('track attendance remains pending until tested and retains exact evaluated segments for present or late', () => {
  const current = week(), student = current.students[0]!; const payload = sessionAttendancePayload(current, student, 'present');
  assert.ok('segments' in payload); assert.deepEqual(payload.segments, [{ recorded: false }, { recorded: false }]);
  assert.equal(sessionAttendancePreview(current, student, 'present').grade, 10);
  const tested = decodeSessionWeek(testedWeek(), 'track'), subject = tested.students[0]!;
  assert.equal(sessionTested(subject), true); assert.equal(sessionTested(decodeSessionWeek(preparedWeek(), 'track').students[0]!), false);
  const preserved = sessionAttendancePayload(tested, subject, 'late'); assert.ok('segments' in preserved); assert.equal(preserved.segments![0]!.recorded, true);
  assert.deepEqual(preserved.segments![0]!.range, { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 3 });
  assert.equal(sessionAttendanceDeletesEvaluation(subject, 'excused'), true); assert.equal(sessionAttendanceDeletesEvaluation(subject, 'late'), false);
  const absent = sessionAttendancePayload(tested, subject, 'absent'); assert.ok('segments' in absent); assert.deepEqual(absent.segments, []);
});
test('attempts validate signed-token shape, exact segment count, source, maximum and reference limits', () => {
  const current = decodeSessionWeek(preparedWeek(), 'track'), student = current.students[0]!;
  const attempt = decodeSessionAttempt(rawAttempt(), current, student); assert.equal(attempt.studentId, student.id);
  assert.equal(attempt.segments.every(segment => !segment.recorded), true);
  for (const patch of [{ attemptToken: '' }, { attemptToken: 'unsigned' }, { segments: [] }, { segments: [rawAttempt().segments[0]] },
    { segments: rawAttempt().segments.map(item => ({ ...item, source: 'memorization' })) }, { segments: rawAttempt().segments.map(item => ({ ...item, max: 99 })) }]) {
    assert.throws(() => decodeSessionAttempt({ ...rawAttempt(), ...patch }, current, student), isCode('invalid-response'));
  }
});
test('Arabic and Persian error counts are exact integers; invalid and excessive counters are rejected', () => {
  assert.equal(sessionErrorCount('١٢'), 12); assert.equal(sessionErrorCount('۲۳'), 23); assert.equal(sessionErrorCount('1000'), 1000);
  for (const value of ['', '-1', '1.5', '١٫٥', '1e1', 'NaN', '1001']) assert.throws(() => sessionErrorCount(value), isCode('validation'));
});
test('test preview scores confirmed partial segments and full completion with the original shared engine', () => {
  const current = decodeSessionWeek(preparedWeek(), 'track'), student = current.students[0]!, attempt = decodeSessionAttempt(rawAttempt(), current, student);
  const drafts = [emptySessionSegmentDraft(), emptySessionSegmentDraft()];
  assert.equal(sessionTestPreview(current, student, attempt, drafts).grade, 10);
  const partial = [{ ...drafts[0]!, confirmed: true, mistakes: '١', warnings: '٢', hesitations: '١' }, drafts[1]!];
  assert.equal(sessionTestPreview(current, student, attempt, partial).grade, 12.5);
  assert.throws(() => sessionTestSegments(attempt, partial, true), isCode('validation'));
  const complete = partial.map(item => ({ ...item, confirmed: true }));
  assert.equal(sessionTestPreview(current, student, attempt, complete).grade, 22.5);
  const failed = complete.map(item => ({ ...item, mistakes: '2', warnings: '0', hesitations: '0' }));
  assert.equal(sessionTestPreview(current, student, attempt, failed).grade, 10);
  const segments = sessionTestSegments(attempt, complete, true);
  assert.deepEqual(segments[0]!.range, { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 3 });
  assert.equal('grade' in segments[0]!, false); assert.equal('max' in segments[0]!, false);
});
test('student search normalizes Arabic spelling and range display preserves the selected server verses', () => {
  assert.equal(filterSessionStudents(week().students, 'احمد موسي').length, 1);
  const prepared = decodeSessionAttempt(rawAttempt(), decodeSessionWeek(preparedWeek(), 'track'), decodeSessionWeek(preparedWeek(), 'track').students[0]!);
  assert.match(sessionRangeLabel(prepared.segments[0]!.range), /الفاتحة/); assert.match(sessionRangeLabel(null), /لم/);
});
test('session snapshots preserve effective Sunday defaults when first saved attendance freezes policy', () => {
  const current = week(); const frozen = { ...current, policy: { ...current.policy,
    trackSession: { ...current.policy.trackSession, sessionDay: 0 }, weeklySession: { ...current.policy.weeklySession, sessionDay: 0 } } };
  assert.equal(sessionSnapshot(current, current.students[0]!), sessionSnapshot(frozen, frozen.students[0]!));
  assert.notEqual(sessionSnapshot(current, current.students[0]!), sessionSnapshot({ ...current, policy: { ...policy, trackSession: { ...policy.trackSession, mistakeDeduction: 3 } } }, current.students[0]!));
});
test('load routes select component, circle and historical week using only existing endpoints', async () => {
  const paths: string[] = []; const controller = await setup(async url => { const path = url.replace('https://example.invalid/api', ''); paths.push(path);
    return json(path === '/committees' ? [circle] : rawWeek()); });
  const loaded = await createSessionManagementApi(controller).load('weekly', weekStart, 3);
  assert.equal(loaded.week.component, 'weekly'); assert.deepEqual(paths, [`/grading/week?component=weekly&weekStart=${weekStart}&committeeId=3`, '/committees']);
});
test('session attendance sends exact persisted component and status without unrelated grades or roles', async () => {
  const bodies: Record<string, unknown>[] = []; const controller = await setup(async (_url, options) => {
    if (options.method === 'GET') return json(rawWeek()); bodies.push(JSON.parse(String(options.body)) as Record<string, unknown>); return json({ ok: true, result: {} }); });
  await createSessionManagementApi(controller).setAttendance(week('weekly'), 2, 'late');
  assert.deepEqual(bodies, [{ studentId: 2, weekStart, component: 'weekly', attendanceStatus: 'late' }]);
});
test('discarding an existing track test requires confirmation and removes tested segments only after confirmation', async () => {
  const current = decodeSessionWeek(testedWeek(), 'track'); let calls = 0; let saved: Record<string, unknown> | null = null;
  const controller = await setup(async (_url, options) => { calls++; if (options.method === 'GET') return json(testedWeek());
    saved = JSON.parse(String(options.body)) as Record<string, unknown>; return json({ ok: true }); });
  const api = createSessionManagementApi(controller); await assert.rejects(api.setAttendance(current, 2, 'absent'), isCode('validation')); assert.equal(calls, 0);
  await api.setAttendance(current, 2, 'absent', true); assert.deepEqual(saved, { studentId: 2, weekStart, component: 'track', attendanceStatus: 'absent', segments: [] });
});
test('track prepare and save keep opaque tokens, selected references and one full result per component', async () => {
  const current = decodeSessionWeek(preparedWeek(), 'track'); const calls: { path: string; body: Record<string, unknown> }[] = [];
  const controller = await setup(async (url, options) => { const path = new URL(url).pathname.replace('/api', ''); if (options.method === 'GET') return json(preparedWeek());
    calls.push({ path, body: JSON.parse(String(options.body)) as Record<string, unknown> }); return json(path === '/grading/track-test' ? rawAttempt() : { ok: true }); });
  const api = createSessionManagementApi(controller); const attempt = await api.prepareTest(current, 2);
  await api.saveTest(current, attempt, attempt.segments.map(() => ({ ...emptySessionSegmentDraft(), confirmed: true })));
  assert.deepEqual(calls.map(call => call.path), ['/grading/track-test', '/grading/weekly-component']);
  assert.deepEqual(calls[0]!.body, { studentId: 2, weekStart }); assert.equal(calls[1]!.body.attemptToken, rawAttempt().attemptToken);
  assert.equal('role' in calls[1]!.body, false); assert.equal('policy' in calls[1]!.body, false);
});
test('absent, unrecorded, future, compensated and zero-segment sessions cannot prepare a test', async () => {
  let calls = 0; const controller = await setup(async () => { calls++; return json({}); }); const api = createSessionManagementApi(controller);
  for (const current of [week(), { ...decodeSessionWeek(preparedWeek(), 'track'), seasonalHoliday: true },
    { ...decodeSessionWeek(preparedWeek(), 'track'), periodStart: shiftDateOnly(today, 1) },
    { ...decodeSessionWeek(preparedWeek(), 'track'), students: [{ ...decodeSessionWeek(preparedWeek(), 'track').students[0]!, detail: { ...decodeSessionWeek(preparedWeek(), 'track').students[0]!.detail!, operationType: 'compensation' } }] },
    { ...decodeSessionWeek(preparedWeek(), 'track'), policy: { ...policy, trackSession: { ...policy.trackSession, segmentCount: 0 } } }]) {
    await assert.rejects(api.prepareTest(current, 2), isCode('validation'));
  }
  assert.equal(calls, 0);
});
test('a partial test or attempt assigned to a different week sends no mutation', async () => {
  let calls = 0; const controller = await setup(async () => { calls++; return json({}); }); const api = createSessionManagementApi(controller);
  const current = decodeSessionWeek(preparedWeek(), 'track'), attempt = decodeSessionAttempt(rawAttempt(), current, current.students[0]!);
  await assert.rejects(api.saveTest(current, attempt, attempt.segments.map(emptySessionSegmentDraft)), isCode('validation'));
  await assert.rejects(api.saveTest(current, { ...attempt, weekStart: shiftDateOnly(weekStart, -7) }, attempt.segments.map(() => ({ ...emptySessionSegmentDraft(), confirmed: true }))), isCode('validation'));
  assert.equal(calls, 0);
});
test('fresh reads reject stale attendance, score or policy snapshots before any write', async () => {
  for (const fresh of [testedWeek(), { ...preparedWeek(), policy: { ...policy, trackSession: { ...policy.trackSession, mistakeDeduction: 3 } } }]) {
    let writes = 0; const controller = await setup(async (_url, options) => { if (options.method !== 'GET') writes++; return json(fresh); });
    await assert.rejects(createSessionManagementApi(controller).setAttendance(decodeSessionWeek(preparedWeek(), 'track'), 2, 'late'), isCode('conflict'));
    assert.equal(writes, 0);
  }
});
test('bulk attendance excludes present and compensation records, retains previous tests and reports confirmed failures', async () => {
  const value = testedWeek(); value.students[0]!.grade.trackDetail = { ...(value.students[0]!.grade.trackDetail as object), attendanceStatus: 'late' };
  value.students.push({ ...rawStudent(7), grade: { ...rawStudent(7).grade, trackDetail: { ...evaluateTrackSession(policy, { attendanceStatus: 'absent', segments: segments() }), operationType: 'compensation', attendanceRecorded: true } } });
  value.students.push({ ...rawStudent(9), grade: { ...rawStudent(9).grade, trackDetail: { ...evaluateTrackSession(policy, { attendanceStatus: 'present', segments: segments() }), attendanceRecorded: true } } });
  const written: Record<string, unknown>[] = []; const controller = await setup(async (_url, options) => {
    if (options.method === 'GET') return json(value); const body = JSON.parse(String(options.body)) as Record<string, unknown>; written.push(body);
    return body.studentId === 5 ? json({}, 422) : json({ ok: true }); });
  const result = await createSessionManagementApi(controller).prepareAll(decodeSessionWeek(value, 'track'));
  assert.deepEqual(result, { saved: 1, failed: 1 }); assert.deepEqual(written.map(body => body.studentId), [2, 5]);
  assert.equal((written[0]!.segments as { recorded: boolean }[])[0]!.recorded, true);
});
test('unknown bulk save results stop the remaining requests rather than retrying or pretending partial success', async () => {
  let writes = 0; const controller = await setup(async (_url, options) => {
    if (options.method === 'GET') return json(rawWeek()); writes++; throw new Error('connection lost after synthetic save'); });
  await assert.rejects(createSessionManagementApi(controller).prepareAll(week('weekly')), isCode('network')); assert.equal(writes, 1);
});
test('ungranted roles cannot load or mutate sessions; grants are component-specific and legacy grades remain compatible', async () => {
  for (const actor of [{ ...identity, role: 'student' as const, dashboardPermissions: ['weeklySession', 'trackSession'] },
    { ...identity, role: 'admin' as const, dashboardPermissions: [] }]) {
    let calls = 0; const controller = await setup(async () => { calls++; return json({}); }, actor); const api = createSessionManagementApi(controller);
    await assert.rejects(api.load('weekly'), isCode('forbidden')); await assert.rejects(api.setAttendance(week(), 2, 'present'), isCode('forbidden')); assert.equal(calls, 0);
  }
  const controller = await setup(async url => json(url.endsWith('/committees') ? [circle] : rawWeek()), { ...identity, role: 'admin', dashboardPermissions: ['weeklySession'] });
  await assert.rejects(createSessionManagementApi(controller).load('track'), isCode('forbidden')); assert.equal((await createSessionManagementApi(controller).load('weekly')).week.component, 'weekly');
  const legacy = await setup(async url => json(url.endsWith('/committees') ? [circle] : rawWeek()), { ...identity, role: 'admin', dashboardPermissions: ['grades'] });
  assert.equal((await createSessionManagementApi(legacy).load('track')).week.component, 'track');
});
test('server student scope, stale signed attempts, validation and denied grades surface without unsafe fallback', async () => {
  for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation']] as const) {
    const controller = await setup(async (_url, options) => options.method === 'GET' ? json(rawWeek()) : json({ internal: 'never show' }, status));
    await assert.rejects(createSessionManagementApi(controller).setAttendance(week('weekly'), 2, 'present'), isCode(code));
  }
});
test('failed fresh reads and missing mutation acknowledgements prevent further writes or remain unknown', async () => {
  let writes = 0; const disconnected = await setup(async (_url, options) => { if (options.method !== 'GET') writes++; throw new Error('no read'); });
  await assert.rejects(createSessionManagementApi(disconnected).setAttendance(week('weekly'), 2, 'present'), isCode('network')); assert.equal(writes, 0);
  const malformed = await setup(async (_url, options) => options.method === 'GET' ? json(rawWeek()) : json({ result: {} }));
  await assert.rejects(createSessionManagementApi(malformed).setAttendance(week('weekly'), 2, 'present'), isCode('invalid-response'));
});
test('old session services reject revoked grants and account changes, including late responses', async () => {
  const actor = { ...identity, role: 'admin' as const, dashboardPermissions: ['weeklySession'] }; let current: NativeSession = actor;
  let release: (() => void) | undefined; const controller = await setup(async url => url.endsWith('/auth/session') ? json(current) : url.endsWith('/auth/logout') ? json({ ok: true })
    : (await new Promise<void>(resolve => { release = resolve; }), json(rawWeek())), actor);
  const api = createSessionManagementApi(controller); const pending = api.setAttendance(week('weekly'), 2, 'present');
  current = { ...actor, dashboardPermissions: [] }; await controller.restore(); release!();
  await assert.rejects(pending, isCode('cancelled')); await assert.rejects(api.load('weekly'), isCode('forbidden'));
  await controller.logout(); Object.assign(actor, { id: 9 }); await controller.login({ loginNumber: '0009', password: 'synthetic' });
  await assert.rejects(api.load('weekly'), isCode('cancelled'));
});
