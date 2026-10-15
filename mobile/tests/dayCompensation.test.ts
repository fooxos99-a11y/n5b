import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGradingPolicy } from '../../shared/grading-policy.js';
import { activeDayCompensation, cancellationReason, compensationPolicyPayload, compensationReference, compensationPeriod,
  requireDayCompensationScope, type CompensationPolicyDraft } from '../src/domain/dayCompensation';
import type { NativeSession, NativeSessionController, NativeSessionSnapshot } from '../src/domain/nativeSession';
import { createDayCompensationApi, decodeCompensationDays, decodeCompensationOverview, decodeCompensationPolicy,
  decodeCompensationRecord } from '../src/services/dayCompensationApi';
import { NativeApiError } from '../src/services/nativeApi';

const today = '2026-10-14'; const start = '2026-10-11';
const manager: NativeSession = { role: 'manager', id: 8, name: 'FixtureManager', dashboardPermissions: [],
  complex: { name: 'Fixture', registrationNumber: 'native-day-compensation' } };
const administrator: NativeSession = { ...manager, role: 'admin', dashboardPermissions: ['weeklySession', 'trackSession', 'settings'] };
const supervisor: NativeSession = { ...manager, role: 'supervisor', dashboardPermissions: ['quranEvaluation'] };
const day = { date: today, dayNumber: 4 };
const audit = { id: 9, studentId: 1, date: today, scope: 'program', actorName: 'FixtureManager', recordedAt: '2026-10-14T16:20:00',
  excuseReference: compensationReference, cancelledAt: null, cancelledByName: null, cancellationReason: null };
const policy = normalizeGradingPolicy({ weeklySession: { sessionDay: 3 }, trackSession: { sessionDay: 3 } });
const overview = () => ({ weekStart: start, weekEnd: '2026-10-17', policy, canManageCompensations: true,
  students: [1, 2].map(id => ({ id, name: `FixturePupil${id}`, compensationDays: { program: [day], track: [day] }, compensations: [], grade: {} })) });
const isCode = (code: string) => (error: unknown) => error instanceof NativeApiError && error.code === code;
interface Call { path: string; method: string; body: Record<string, unknown> | undefined }
interface FixtureState { week: ReturnType<typeof overview>; records: Record<string, unknown>[]; settings: Record<string, unknown> }
function fixture(actor = manager, handle?: (call: Call, state: FixtureState) => unknown | Promise<unknown>) {
  let identity: NativeSession | null = actor; const calls: Call[] = [];
  const state: FixtureState = { week: overview(), records: [], settings: { allowQuranCompensation: true, allowQuranExtra: false,
    attendanceManualEnabled: true, attendanceAccountEnabled: true, registrationEnabled: true, registrationAcceptTemplate: 'FixtureTemplate',
    familyPointsAddToStudents: true, maxSupervisorStudentPoints: 7, quranReferenceMode: 'ayah',
    memorizationExecutionSource: 'teacher', reviewExecutionSource: 'teacher', linkExecutionSource: 'teacher', repeatExecutionSource: 'teacher', quranTaskExecutionSource: 'teacher' } };
  function weekBody() {
    return { ...state.week, canManageCompensations: identity?.role === 'manager' || !!identity?.dashboardPermissions.includes('settings'),
      students: state.week.students.map(student => ({ ...student, compensations: state.records.filter(row => row.studentId === student.id),
        compensationDays: Object.fromEntries(['program', 'track'].map(scope => [scope, student.compensationDays[scope as 'program' | 'track'].filter(day =>
          !state.records.some(row => row.studentId === student.id && row.scope === scope && !row.cancelledAt
            && compensationPeriod(scope as 'program' | 'track', String(row.date)) === compensationPeriod(scope as 'program' | 'track', day.date)))])) })) };
  }
  const controller: NativeSessionController = {
    getSnapshot: (): NativeSessionSnapshot => ({ status: identity ? 'authenticated' : 'signed-out', session: identity, error: null }),
    subscribe: () => () => {}, login: async () => {}, restore: async () => {}, cancel: () => {},
    logout: async () => { identity = null; return { localCleared: true, serverRevoked: true, error: null }; },
    async request<T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (value: unknown) => T): Promise<T> {
      const call = { path, method: options?.method ?? 'GET', body: options?.body as Record<string, unknown> | undefined }; calls.push(call);
      let body = await handle?.(call, state);
      if (body === undefined) {
        if (path.startsWith('/grading/week?')) body = weekBody();
        else if (path.includes('-compensation-days?')) {
          const scope = path.includes('/program-') ? 'program' : 'track'; const id = Number(new URLSearchParams(path.split('?')[1]).get('studentId'));
          const student = weekBody().students.find(row => row.id === id); body = { days: student?.compensationDays[scope] ?? [] };
        } else if (path.endsWith('/cancel')) {
          const id = Number(path.split('/')[3]); const row = state.records.find(row => row.id === id)!;
          row.cancelledAt = '2026-10-14T14:00:00.000Z'; row.cancelledByName = 'FixtureManager'; row.cancellationReason = call.body?.reason;
          body = { ok: true, result: { studentId: row.studentId, date: row.date, scope: row.scope } };
        } else if (path === '/settings') {
          if (call.method === 'PUT') state.settings = { ...call.body }; body = state.settings;
        } else {
          const scope = path.includes('/program-') ? 'program' : 'track'; const id = state.records.length + 9;
          const entry = { ...audit, id, studentId: call.body?.studentId, date: call.body?.date, scope }; state.records.push(entry);
          body = { ok: true, result: { id, studentId: entry.studentId, date: entry.date, scope,
            components: [{ component: scope === 'track' ? 'track' : 'memorization', grade: 2, ...(scope === 'program' ? { max: 2 } : {}) }] } };
        }
      }
      return decode ? decode(structuredClone(body)) : structuredClone(body) as T;
    },
  };
  return { controller, calls, state, api: createDayCompensationApi(controller, () => today), change: (next: NativeSession | null) => { identity = next; } };
}
function deferred() { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() }; }

test('day compensation grants follow the separate program and track contracts and manager access', () => {
  requireDayCompensationScope(manager, 'program'); requireDayCompensationScope(manager, 'track'); requireDayCompensationScope(supervisor, 'program');
  requireDayCompensationScope({ ...administrator, dashboardPermissions: ['weeklySession'] }, 'program');
  assert.throws(() => requireDayCompensationScope(supervisor, 'track'), isCode('forbidden'));
  assert.throws(() => requireDayCompensationScope({ ...administrator, dashboardPermissions: ['settings'] }, 'program'), isCode('forbidden'));
  assert.throws(() => requireDayCompensationScope({ ...manager, role: 'student', dashboardPermissions: ['quranEvaluation', 'trackSession'] }, 'program'), isCode('forbidden'));
});
test('legacy grades grants expand to both session compensation scopes while unrelated grants do not', async () => {
  const f = fixture({ ...administrator, dashboardPermissions: ['grades'] }); assert.equal(f.api.canUse('program'), true); assert.equal(f.api.canUse('track'), true);
  const limited = fixture({ ...administrator, dashboardPermissions: ['reports', 'manualAttendance'] });
  await assert.rejects(limited.api.loadOverview('program'), isCode('forbidden')); assert.equal(limited.calls.length, 0);
});
test('eligibility decoder accepts only valid numbered unique server dates without recalculating eligibility', () => {
  assert.deepEqual(decodeCompensationDays([{ date: today, dayNumber: '4' }]), [day]);
  for (const days of [[{ date: '2026-02-30', dayNumber: 1 }], [{ date: today, dayNumber: 0 }], [{ date: today, dayNumber: 1.5 }],
    [{ date: today, dayNumber: true }], [day, day], {}]) assert.throws(() => decodeCompensationDays(days), isCode('invalid-response'));
});
test('audit decoder handles SQL local and canonical UTC timestamps and rejects malformed audit identities', () => {
  const record = decodeCompensationRecord(audit); assert.equal(record.cancelledAt, null); assert.equal(record.cancelledByName, ''); assert.equal(Object.isFrozen(record), true);
  assert.equal(decodeCompensationRecord({ ...audit, cancelledAt: '2026-10-14T14:00:00.000Z' }).cancelledAt, '2026-10-14T14:00:00.000Z');
  for (const patch of [{ id: true }, { studentId: 0 }, { scope: 'invented' }, { recordedAt: '2026-02-30T16:20:00' },
    { cancelledAt: '2026-10-14T25:00:00.000Z' }, { excuseReference: null }]) assert.throws(() => decodeCompensationRecord({ ...audit, ...patch }), isCode('invalid-response'));
});
test('program overview decodes the actual quranEvaluation-only response with no weekly grades', () => {
  const body = overview(); const decoded = decodeCompensationOverview(body, 'program');
  assert.equal(decoded.students.length, 2); assert.equal(decoded.students[0]!.days[0]!.dayNumber, 4); assert.equal(Object.isFrozen(decoded.students[0]!), true);
  assert.equal('grade' in decoded.students[0]!, false);
});
test('overview decoder rejects mismatched week boundaries, foreign-student records and duplicate roster IDs', () => {
  const badRecord = { ...overview(), students: [{ ...overview().students[0]!, compensations: [{ ...audit, studentId: 2 }] }] };
  const outsideDate = { ...overview(), students: [{ ...overview().students[0]!, compensations: [{ ...audit, date: '2026-10-18' }] }] };
  for (const body of [{ ...overview(), weekStart: today }, { ...overview(), weekEnd: today }, badRecord, outsideDate,
    { ...overview(), students: [overview().students[0], overview().students[0]] }, { ...overview(), canManageCompensations: 'true' }]) {
    assert.throws(() => decodeCompensationOverview(body, 'program'), isCode('invalid-response'));
  }
});
test('program-only supervisors load a minimal scoped overview without staff, report, or weeklySession requests', async () => {
  const f = fixture(supervisor); const data = await f.api.loadOverview('program', today);
  assert.equal(data.canManage, false); assert.deepEqual(f.calls.map(call => call.path), ['/grading/week?component=weekly&weekStart=2026-10-14']);
  await assert.rejects(f.api.loadOverview('track', today), isCode('forbidden')); assert.equal(f.calls.length, 1);
});
test('compensation dialogs use both existing eligibility and target-week endpoints and fail closed outside the scoped roster', async () => {
  const f = fixture(); const data = await f.api.load('track', 1, today); assert.equal(data.scope, 'track'); assert.equal(data.student.id, 1);
  assert.deepEqual(f.calls.map(call => call.path).sort(), ['/grading/track-compensation-days?studentId=1', '/grading/week?component=track&weekStart=2026-10-14']);
  await assert.rejects(f.api.load('program', 99, today), isCode('forbidden'));
});
test('actual program and track mutations preserve the fixed approved reference without sending attendance, grades or points', async () => {
  for (const scope of ['program', 'track'] as const) {
    const f = fixture(); const data = await f.api.load(scope, 1, today); const result = await f.api.compensate(data, data.student.days[0]!);
    assert.equal(result.id, 9); assert.equal(result.scope, scope); const write = f.calls.find(call => call.method === 'POST')!;
    assert.equal(write.path, `/grading/${scope}-compensation`); assert.deepEqual(write.body, { studentId: 1, date: today, excuseReference: compensationReference });
    assert.equal(f.calls.filter(call => call.path.includes('-compensation-days?')).length, 2); assert.equal(f.calls.filter(call => call.path.startsWith('/grading/week?')).length, 2);
  }
});
test('successful grants invalidate their previous snapshot and fresh eligibility/history prevents a duplicate grant', async () => {
  const f = fixture(); const data = await f.api.load('program', 1, today); await f.api.compensate(data, data.student.days[0]!);
  await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('conflict'));
  const fresh = await f.api.load('program', 1, today); assert.equal(fresh.student.days.length, 0); assert.equal(activeDayCompensation(fresh)?.id, 9);
  await assert.rejects(f.api.compensate(fresh, day), isCode('validation')); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('copied, future, unapproved and mismatched selected days fail before any mutation', async () => {
  const f = fixture(); const data = await f.api.load('program', 1, today); const count = f.calls.length;
  await assert.rejects(f.api.compensate(data, { ...data.student.days[0]! }), isCode('validation'));
  await assert.rejects(f.api.compensate({ ...data }, data.student.days[0]!), isCode('conflict'));
  await assert.rejects(f.api.compensate(data, { date: '2026-10-15', dayNumber: 5 }), isCode('validation')); assert.equal(f.calls.length, count);
  f.state.week.students[0]!.compensationDays.program = [{ date: '2026-10-15', dayNumber: 5 }];
  const future = await f.api.load('program', 1, '2026-10-15'); await assert.rejects(f.api.compensate(future, future.student.days[0]!), isCode('validation'));
});
test('changed eligibility, history or policy rejects a stale compensation before any POST', async () => {
  for (const kind of ['days', 'record', 'policy']) {
    const f = fixture(); const data = await f.api.load('program', 1, today);
    if (kind === 'days') f.state.week.students[0]!.compensationDays.program = [];
    else if (kind === 'record') f.state.records.push({ ...audit });
    else f.state.week.policy = normalizeGradingPolicy({ weeklySession: { sessionDay: 3, attendance: 25 }, trackSession: { sessionDay: 3 } });
    await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('conflict')); assert.equal(f.calls.some(call => call.method === 'POST'), false);
  }
});
test('known eligibility failure leaves the operation unsaved and never retries automatically', async () => {
  const f = fixture(manager, call => { if (call.method === 'POST') throw new NativeApiError('validation', 422); });
  const data = await f.api.load('program', 1, today); await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('validation'));
  assert.equal(f.state.records.length, 0); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('a missing compensation reply locks writes until a same-student/week history read confirms current state', async () => {
  let lost = true; let failRead = false;
  const f = fixture(manager, (call, state) => {
    if (call.method === 'POST' && lost) { lost = false; state.records.push({ ...audit }); throw new NativeApiError('network'); }
    if (failRead && call.path.startsWith('/grading/week?')) throw new NativeApiError('server', 503);
  });
  const data = await f.api.load('program', 1, today); await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('network'));
  await f.api.loadOverview('program', today); await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('conflict'));
  await assert.rejects(f.api.load('program', 2, today), isCode('conflict')); await assert.rejects(f.api.load('track', 1, today), isCode('conflict'));
  failRead = true; await assert.rejects(f.api.load('program', 1, today), isCode('server')); await assert.rejects(f.api.compensate(data, data.student.days[0]!), isCode('conflict'));
  failRead = false; const proof = await f.api.load('program', 1, today); assert.equal(proof.student.records[0]!.id, 9); assert.equal(proof.student.days.length, 0);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('a fresh same-context read can prove that an unknown grant was not stored while failed or unrelated reads cannot unlock it', async () => {
  let fail = true; const f = fixture(manager, call => { if (call.method === 'POST' && fail) { fail = false; throw new NativeApiError('timeout'); } });
  const source = await f.api.load('program', 1, today); await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('timeout'));
  await assert.rejects(f.api.load('program', 1, '2026-10-07'), isCode('conflict'));
  const proof = await f.api.load('program', 1, today); assert.equal(proof.student.records.length, 0); await f.api.compensate(proof, proof.student.days[0]!);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});
test('unknown grant reconciliation remains locked when neither active history nor eligibility proves its target date', async () => {
  const f = fixture(manager, call => { if (call.method === 'POST') throw new NativeApiError('network'); });
  const source = await f.api.load('program', 1, today); await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('network'));
  f.state.week.students[0]!.compensationDays.program = []; await assert.rejects(f.api.load('program', 1, today), isCode('conflict'));
  await assert.rejects(f.api.savePolicy(decodeCompensationPolicy(f.state.settings), { allowQuranCompensation: false, allowQuranExtra: true }), isCode('conflict'));
});
test('mutation acknowledgement rejects mismatched student/date/scope/grade records as an unknown result', async () => {
  for (const result of [{ id: 9, studentId: 2, date: today, scope: 'program', components: [{ component: 'memorization', grade: 2 }] },
    { id: 9, studentId: 1, date: start, scope: 'program', components: [{ component: 'memorization', grade: 2 }] },
    { id: 9, studentId: 1, date: today, scope: 'track', components: [{ component: 'track', grade: 2 }] },
    { id: 9, studentId: 1, date: today, scope: 'program', components: [{ component: 'attendance', grade: 2 }] }]) {
    const f = fixture(manager, call => call.method === 'POST' ? { ok: true, result } : undefined); const source = await f.api.load('program', 1, today);
    await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('invalid-response'));
    await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('conflict'));
  }
});
test('administrative cancellation uses a 3..500-character reason and only a loaded active audit record', async () => {
  const f = fixture(); f.state.records.push({ ...audit }); const source = await f.api.load('program', 1, today);
  assert.equal(activeDayCompensation(source)?.id, 9); await f.api.cancel(source, source.student.records[0]!, '  تصحيح إداري  ');
  assert.deepEqual(f.calls.find(call => call.method === 'POST'), { path: '/grading/compensations/9/cancel', method: 'POST', body: { reason: 'تصحيح إداري' } });
  assert.equal((await f.api.load('program', 1, today)).student.records[0]!.cancelledAt, '2026-10-14T14:00:00.000Z');
  assert.throws(() => cancellationReason('x'), isCode('validation')); assert.throws(() => cancellationReason('x'.repeat(501)), isCode('validation'));
});
test('track cancellation follows the week period and rejects forged, cancelled or unauthorized records', async () => {
  const f = fixture(); f.state.records.push({ ...audit, scope: 'track', date: '2026-10-12' }); const source = await f.api.load('track', 1, today);
  assert.equal(activeDayCompensation(source)?.date, '2026-10-12');
  await assert.rejects(f.api.cancel(source, { ...source.student.records[0]! }, 'سبب صحيح'), isCode('validation'));
  await f.api.cancel(source, source.student.records[0]!, 'سبب صحيح');
  const cancelled = await f.api.load('track', 1, today); await assert.rejects(f.api.cancel(cancelled, cancelled.student.records[0]!, 'سبب صحيح'), isCode('validation'));
  const limited = fixture(supervisor); limited.state.records.push({ ...audit }); const row = await limited.api.load('program', 1, today);
  await assert.rejects(limited.api.cancel(row, row.student.records[0]!, 'سبب صحيح'), isCode('forbidden')); assert.equal(limited.calls.some(call => call.method === 'POST'), false);
});
test('lost cancellation reply requires a fresh same-student audit read and does not repeat the cancellation', async () => {
  const f = fixture(manager, (call, state) => {
    if (call.path.endsWith('/cancel')) { state.records[0]!.cancelledAt = '2026-10-14T14:00:00.000Z'; throw new NativeApiError('network'); }
  });
  f.state.records.push({ ...audit }); const source = await f.api.load('program', 1, today);
  await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'تصحيح إداري'), isCode('network'));
  await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'تصحيح إداري'), isCode('conflict'));
  const proof = await f.api.load('program', 1, today); assert.ok(proof.student.records[0]!.cancelledAt);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('policy full merge preserves fresh unrelated settings, attendance flags and all teacher Quran execution sources', async () => {
  const f = fixture(); const source = await f.api.loadPolicy(); f.state.settings.registrationAcceptTemplate = 'NewestTemplate'; f.state.settings.maxSupervisorStudentPoints = 11;
  await f.api.savePolicy(source, { allowQuranCompensation: false, allowQuranExtra: true }); const payload = f.calls.find(call => call.method === 'PUT')!.body!;
  assert.equal(payload.registrationAcceptTemplate, 'NewestTemplate'); assert.equal(payload.maxSupervisorStudentPoints, 11);
  assert.equal(payload.attendanceManualEnabled, true); assert.equal(payload.attendanceAccountEnabled, true); assert.equal(payload.familyPointsAddToStudents, true);
  for (const key of ['memorizationExecutionSource', 'reviewExecutionSource', 'linkExecutionSource', 'repeatExecutionSource', 'quranTaskExecutionSource']) assert.equal(payload[key], 'teacher');
  assert.equal(payload.allowQuranCompensation, false); assert.equal(payload.allowQuranExtra, true);
  assert.deepEqual(f.calls.map(call => [call.path, call.method]), [['/settings', 'GET'], ['/settings', 'GET'], ['/settings', 'PUT']]);
});
test('Quran compensation/extra switches do not fabricate eligibility restrictions for the independent day compensation contract', async () => {
  const f = fixture(); f.state.settings.allowQuranCompensation = false; const source = await f.api.load('program', 1, today);
  await f.api.compensate(source, source.student.days[0]!); assert.equal(f.state.records.length, 1); assert.equal(f.calls.some(call => call.path === '/settings'), false);
});
test('settings group comparison refuses stale switch values and validates explicit boolean payloads before PUT', async () => {
  const f = fixture(); const source = await f.api.loadPolicy(); f.state.settings.allowQuranExtra = true;
  await assert.rejects(f.api.savePolicy(source, { allowQuranCompensation: false, allowQuranExtra: false }), isCode('conflict'));
  assert.equal(f.calls.some(call => call.method === 'PUT'), false);
  assert.throws(() => compensationPolicyPayload({ allowQuranCompensation: 'true', allowQuranExtra: false } as unknown as CompensationPolicyDraft, {}), isCode('validation'));
  assert.throws(() => decodeCompensationPolicy({ allowQuranCompensation: true, allowQuranExtra: 1 }), isCode('invalid-response'));
});
test('unknown policy writes block both day operations and policy repeat until a successful settings read', async () => {
  let lost = true; let readFails = false; const f = fixture(manager, (call, state) => {
    if (call.method === 'PUT' && lost) { state.settings = { ...call.body }; lost = false; throw new NativeApiError('timeout'); }
    if (call.path === '/settings' && readFails) throw new NativeApiError('server', 503);
  });
  const source = await f.api.loadPolicy(); await assert.rejects(f.api.savePolicy(source, { allowQuranCompensation: false, allowQuranExtra: true }), isCode('timeout'));
  await assert.rejects(f.api.load('program', 1, today), isCode('conflict')); await assert.rejects(f.api.savePolicy(source, source.policy), isCode('conflict'));
  readFails = true; await assert.rejects(f.api.loadPolicy(), isCode('server')); await assert.rejects(f.api.savePolicy(source, source.policy), isCode('conflict'));
  readFails = false; const proof = await f.api.loadPolicy(); assert.equal(proof.policy.allowQuranExtra, true); assert.equal(proof.policy.allowQuranCompensation, false);
  await f.api.load('program', 1, today); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
});
test('mismatched policy response becomes unknown rather than claiming the switches were saved', async () => {
  const f = fixture(manager, (call, state) => call.method === 'PUT' ? state.settings : undefined); const source = await f.api.loadPolicy();
  await assert.rejects(f.api.savePolicy(source, { allowQuranCompensation: false, allowQuranExtra: true }), isCode('invalid-response'));
  await assert.rejects(f.api.savePolicy(source, source.policy), isCode('conflict'));
});
test('missing settings and scope grants prevent read and writes before any outbound request', async () => {
  const f = fixture(supervisor); assert.equal(f.api.canEditPolicy(), false); await assert.rejects(f.api.loadPolicy(), isCode('forbidden'));
  await assert.rejects(f.api.savePolicy(decodeCompensationPolicy(f.state.settings), { allowQuranCompensation: false, allowQuranExtra: true }), isCode('forbidden'));
  f.change({ ...supervisor, dashboardPermissions: [] }); await assert.rejects(f.api.load('program', 1, today), isCode('forbidden')); assert.equal(f.calls.length, 0);
});
test('identity changes, sign-out and grant revocation invalidate cached services before compensation or cancellation', async () => {
  for (const next of [{ ...administrator, id: 9 }, { ...administrator, role: 'supervisor' as const },
    { ...administrator, complex: { ...administrator.complex, registrationNumber: 'other-tenant' } }, null,
    { ...administrator, dashboardPermissions: ['settings'] }]) {
    const f = fixture(administrator); const source = await f.api.load('program', 1, today); const count = f.calls.length; f.change(next);
    const code = next === null ? 'unauthorized' : next.id !== administrator.id || next.role !== administrator.role || next.complex.registrationNumber !== administrator.complex.registrationNumber ? 'cancelled' : 'forbidden';
    await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode(code)); assert.equal(f.calls.length, count);
  }
});
test('scope and identity guards recheck every week/eligibility response before exposing a snapshot', async () => {
  for (const target of ['/grading/week?', '-compensation-days?']) {
    const f = fixture(administrator, call => { if (call.path.includes(target)) f.change({ ...administrator, dashboardPermissions: [] }); });
    await assert.rejects(f.api.load('program', 1, today), isCode('forbidden'));
  }
  const f = fixture(administrator, call => { if (call.path.startsWith('/grading/week?')) f.change({ ...administrator, id: 9 }); });
  await assert.rejects(f.api.loadOverview('program', today), isCode('cancelled'));
});
test('grant changes after preflight or mutation response stop the operation with no unauthorized follow-up', async () => {
  for (const phase of ['preflight', 'response']) {
    let armed = false; const f = fixture(administrator, call => {
      if (armed && (phase === 'preflight' ? call.path.startsWith('/grading/week?') : call.method === 'POST')) f.change({ ...administrator, dashboardPermissions: [] });
    });
    const source = await f.api.load('program', 1, today); armed = true;
    await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('forbidden'));
    assert.equal(f.calls.filter(call => call.method === 'POST').length, phase === 'response' ? 1 : 0);
  }
});
test('settings revocation is checked before and after cancellation and policy requests', async () => {
  for (const kind of ['cancel', 'policy']) {
    let armed = false; const f = fixture(administrator, call => {
      if (armed && (kind === 'cancel' ? call.path.endsWith('/cancel') : call.path === '/settings' && call.method === 'PUT'))
        f.change({ ...administrator, dashboardPermissions: ['weeklySession', 'trackSession'] });
    });
    if (kind === 'cancel') { f.state.records.push({ ...audit }); const source = await f.api.load('program', 1, today); armed = true;
      await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'تصحيح إداري'), isCode('forbidden')); }
    else { const source = await f.api.loadPolicy(); armed = true; await assert.rejects(f.api.savePolicy(source, source.policy), isCode('forbidden')); }
    const count = f.calls.length; await assert.rejects(f.api.loadPolicy(), isCode('forbidden')); assert.equal(f.calls.length, count);
  }
});
test('settings reads recheck grant and identity before exposing policy or sending a stale PUT', async () => {
  const read = fixture(administrator, call => { if (call.path === '/settings') read.change({ ...administrator, dashboardPermissions: ['weeklySession'] }); });
  await assert.rejects(read.api.loadPolicy(), isCode('forbidden'));
  let armed = false; const changed = fixture(administrator, call => { if (armed && call.path === '/settings') changed.change({ ...administrator,
    complex: { ...administrator.complex, registrationNumber: 'changed-tenant' } }); });
  const source = await changed.api.loadPolicy(); armed = true; await assert.rejects(changed.api.savePolicy(source, source.policy), isCode('cancelled'));
  assert.equal(changed.calls.some(call => call.method === 'PUT'), false);
});
test('lost cancellation keeps its lock when the audit request fails or its target record cannot be found', async () => {
  let failRead = false; const f = fixture(manager, call => {
    if (call.path.endsWith('/cancel')) throw new NativeApiError('network');
    if (failRead && call.path.startsWith('/grading/week?')) throw new NativeApiError('server', 503);
  });
  f.state.records.push({ ...audit }); const source = await f.api.load('program', 1, today);
  await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'سبب صحيح'), isCode('network'));
  failRead = true; await assert.rejects(f.api.load('program', 1, today), isCode('server'));
  failRead = false; f.state.records = []; await assert.rejects(f.api.load('program', 1, today), isCode('conflict'));
  await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'سبب صحيح'), isCode('conflict'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('the actual legacy cancellation conflict is shown without deleting audit or retrying a destructive correction', async () => {
  const f = fixture(manager, call => { if (call.path.endsWith('/cancel')) throw new NativeApiError('conflict', 409); });
  f.state.records.push({ ...audit }); const source = await f.api.load('program', 1, today);
  await assert.rejects(f.api.cancel(source, source.student.records[0]!, 'تصحيح إداري'), isCode('conflict'));
  assert.equal(f.state.records[0]!.cancelledAt, null); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('changed account or tenant after a compensation response rejects the result and cannot reuse the old service', async () => {
  for (const next of [{ ...administrator, id: 9 }, { ...administrator, complex: { ...administrator.complex, registrationNumber: 'other-tenant' } }]) {
    const f = fixture(administrator, call => { if (call.method === 'POST') f.change(next); }); const source = await f.api.load('program', 1, today);
    await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('cancelled'));
    const count = f.calls.length; await assert.rejects(f.api.load('program', 1, today), isCode('cancelled'));
    assert.equal(f.calls.length, count); assert.equal(f.api.canUse('program'), false);
  }
});
test('running compensation prevents concurrent mutations or snapshot loads and a superseded load cannot restore an older model', async () => {
  const gate = deferred(), entered = deferred(); const f = fixture(manager, async call => { if (call.method === 'POST') { entered.resolve(); await gate.promise; } });
  const source = await f.api.load('program', 1, today); const saving = f.api.compensate(source, source.student.days[0]!); await entered.promise;
  await assert.rejects(f.api.compensate(source, source.student.days[0]!), isCode('conflict')); await assert.rejects(f.api.load('program', 1, today), isCode('conflict'));
  gate.resolve(); await saving; assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  const loadGate = deferred(), loadEntered = deferred(); let initial = true;
  const scoped = fixture(manager, async call => { if (call.path.startsWith('/grading/week?') && initial) { initial = false; loadEntered.resolve(); await loadGate.promise; } });
  const old = scoped.api.load('program', 1, today); await loadEntered.promise; const current = await scoped.api.load('program', 2, today);
  loadGate.resolve(); await assert.rejects(old, isCode('cancelled')); await scoped.api.compensate(current, current.student.days[0]!);
});
