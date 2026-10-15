import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePassingPart, passingExamStatus } from '../../shared/passing-policy.js';
import { createNativeSession, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { canCreatePassingExam, decodePassingExam, decodePassingStudentParts, decodePassingStudents, filterPassingStudents, passingRangeLabel,
  passingReportPart, passingSnapshot, type PassingMark, type PassingType } from '../src/domain/passingManagement';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createPassingManagementApi } from '../src/services/passingManagementApi';

const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [],
  complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const token = 'a'.repeat(64);
const isCode = (code: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === code;
const savedAt = '2026-10-14T11:00:00';
const policy = { maxScore: 100, passScore: 85, mistakeDeduction: 5, warningDeduction: 1, hesitationDeduction: 0.5 };
const range = (juz = 1) => juz === 1
  ? { startPage: 1, startSurah: 1, startAyah: 1, startSurahName: 'الفاتحة', endPage: 21, endSurah: 2, endAyah: 141, endSurahName: 'البقرة' }
  : { startPage: 22, startSurah: 2, startAyah: 142, startSurahName: 'البقرة', endPage: 41, endSurah: 2, endAyah: 252, endSurahName: 'البقرة' };
const rawStudent = (id = 2) => ({ id, name: 'طالب الاجتياز', committeeId: 3 as number | null, committeeName: 'حلقة' as string | null,
  complexId: 4 as number | null, complexName: 'مجمع' as string | null });
function rawAttempt(id = 31, partId = 21) {
  const marks: PassingMark[] = [{ page: 1, startLocation: '1:1:1', endLocation: '1:1:1', selectedText: 'بِسْمِ', markType: 'lahn', notes: 'موضع محفوظ', segmentIndex: 0 }];
  return { id, partId, mode: 'mushaf' as 'mushaf' | 'count', actorName: 'المشرف', createdAt: savedAt,
    result: evaluatePassingPart(policy, { mistakeCount: 1, warningCount: 0, hesitationCount: 0 }), policy: { ...policy }, marks,
    rehifzDecision: 'keep' as 'keep' | 'repeat' | 'pending', rehifzId: null as number | null, rehifzStatus: null as string | null };
}
type RawAttempt = ReturnType<typeof rawAttempt>;
const rawExamPart = (juz = 1, id = 21, attempts: RawAttempt[] = []) => ({ id, juzNumber: juz, ranges: [range(juz)],
  attempts, latestAttempt: attempts[0] ?? null });
type RawExamPart = ReturnType<typeof rawExamPart>;
function rawExam(type: PassingType = 'branch', id = 11, parts: RawExamPart[] = [rawExamPart()]) {
  return { id, studentId: 2, type, studentName: 'طالب الاجتياز', committeeName: 'حلقة' as string | null,
    createdAt: savedAt, parts, status: passingExamStatus(parts) as string };
}
type RawExam = ReturnType<typeof rawExam>;
const rawParts = (exams: RawExam[] = []) => ({ parts: [1, 2].map(juzNumber => ({ juzNumber, ranges: [range(juzNumber)] })), exams });
const snapshot = (type: PassingType = 'branch', exams: RawExam[] = []) => decodePassingStudentParts(rawParts(exams), 2, type);
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}

test('passing student DTOs preserve nullable joins and exclude unrelated contact fields', () => {
  const students = decodePassingStudents([{ ...rawStudent(), committeeId: null, committeeName: null, complexId: null,
    complexName: null, phone: null, email: 'private@example.invalid', password: 'excluded' }]);
  assert.equal(students[0]!.committeeId, null); assert.equal(students[0]!.complexId, null);
  assert.equal(students[0]!.committeeName, ''); assert.equal(students[0]!.complexName, '');
  assert.equal('phone' in students[0]!, false); assert.equal('email' in students[0]!, false); assert.equal('password' in students[0]!, false);
  assert.deepEqual(decodePassingStudents([]), []);
});
test('passing students reject malformed, duplicate and nonpositive identities', () => {
  for (const value of [{ students: [] }, [rawStudent(), rawStudent()], [{ ...rawStudent(), id: 0 }], [{ ...rawStudent(), name: null }],
    [{ ...rawStudent(), committeeId: -1 }], [{ ...rawStudent(), complexName: false }]]) {
    assert.throws(() => decodePassingStudents(value), isCode('invalid-response'));
  }
});
test('passing parts retain eligibility and full historical attempts with their saved policy, result, date and marks', () => {
  const attempt = rawAttempt(); const older = { ...rawAttempt(30), mode: 'count' as const, marks: [], createdAt: '2026-10-10T09:15:00',
    policy: { ...policy, maxScore: 90, passScore: 80, mistakeDeduction: 3 }, rehifzDecision: 'repeat' as const,
    rehifzId: 18, rehifzStatus: 'completed', result: evaluatePassingPart({ ...policy, maxScore: 90, passScore: 80, mistakeDeduction: 3 },
      { mistakeCount: 4, warningCount: 0, hesitationCount: 0 }) };
  const current = snapshot('branch', [rawExam('branch', 11, [rawExamPart(1, 21, [attempt, older])])]);
  assert.equal(current.studentId, 2); assert.equal(current.type, 'branch'); assert.equal(current.parts.length, 2);
  const history = current.exams[0]!.parts[0]!.attempts;
  assert.equal(history.length, 2); assert.deepEqual(history[0]!.policy, attempt.policy);
  assert.deepEqual(history[1]!.result, older.result); assert.equal(history[1]!.createdAt, older.createdAt);
  assert.equal(history[1]!.rehifzId, 18); assert.equal(history[1]!.rehifzStatus, 'completed');
  assert.equal(history[0]!.marks[0]!.markType, 'lahn'); assert.equal(history[0]!.marks[0]!.selectedText, 'بِسْمِ');
  assert.equal(history[0]!.marks[0]!.notes, 'موضع محفوظ'); assert.equal(history[0]!.marks[0]!.segmentIndex, 0);
  assert.deepEqual(current.exams[0]!.parts[0]!.latestAttempt, history[0]);
});
test('exam decoding binds the requested student and type and handles nullable committee labels', () => {
  const exam = decodePassingExam({ ...rawExam(), committeeName: null }, 2, 'branch');
  assert.equal(exam.committeeName, ''); assert.equal(exam.status, 'pending'); assert.equal(exam.parts[0]!.latestAttempt, null);
  assert.throws(() => decodePassingExam(rawExam(), 9, 'branch'), isCode('invalid-response'));
  assert.throws(() => decodePassingExam(rawExam(), 2, 'hafiz'), isCode('invalid-response'));
  assert.throws(() => decodePassingStudentParts(rawParts([rawExam('hafiz')]), 2, 'branch'), isCode('invalid-response'));
});
test('parts and exam decoders reject duplicate identities, unknown states and invalid ranges or dates', () => {
  for (const value of [{ parts: [], exams: null }, { ...rawParts(), parts: [rawParts().parts[0], rawParts().parts[0]] },
    rawParts([rawExam(), rawExam()]), { ...rawParts(), parts: [{ juzNumber: 31, ranges: [range()] }] },
    { ...rawParts(), parts: [{ juzNumber: 1, ranges: [] }] },
    { ...rawParts(), parts: [{ juzNumber: 1, ranges: [{ ...range(), endSurah: 115 }] }] },
    { ...rawParts(), parts: [{ juzNumber: 1, ranges: [{ ...range(), startAyah: 0 }] }] }]) {
    assert.throws(() => decodePassingStudentParts(value, 2, 'branch'), isCode('invalid-response'));
  }
  for (const patch of [{ id: 0 }, { type: 'other' }, { status: 'unknown' }, { createdAt: '2026-02-30T11:00:00' },
    { parts: [rawExamPart(), rawExamPart()] }]) assert.throws(() => decodePassingExam({ ...rawExam(), ...patch }), isCode('invalid-response'));
});
test('attempt decoders reject invalid policy, result, history ordering, part scope and decisions', () => {
  for (const patch of [{ partId: 99 }, { mode: 'unknown' }, { createdAt: '2026-02-30T11:00:00' },
    { policy: { ...policy, passScore: 101 } }, { result: { ...rawAttempt().result, score: -1 } },
    { result: { ...rawAttempt().result, mistakeCount: 1.5 } }, { rehifzDecision: 'unknown' }, { rehifzStatus: 'unknown' }]) {
    const attempt = { ...rawAttempt(), ...patch };
    const part = { ...rawExamPart(), attempts: [attempt], latestAttempt: attempt };
    assert.throws(() => decodePassingExam({ ...rawExam(), parts: [part] }), isCode('invalid-response'));
  }
  const attempt = rawAttempt();
  assert.throws(() => decodePassingExam({ ...rawExam(), parts: [{ ...rawExamPart(), attempts: [attempt, attempt], latestAttempt: attempt }] }), isCode('invalid-response'));
  assert.throws(() => decodePassingExam({ ...rawExam(), parts: [{ ...rawExamPart(1, 21, [attempt]), latestAttempt: rawAttempt(29) }] }), isCode('invalid-response'));
});
test('saved marks must remain inside their original part and segment; legacy marks may omit a segment index', () => {
  const attempt = rawAttempt(); delete attempt.marks[0]!.segmentIndex;
  assert.equal(decodePassingExam(rawExam('branch', 11, [rawExamPart(1, 21, [attempt])])).parts[0]!.attempts[0]!.marks[0]!.startLocation, '1:1:1');
  for (const patch of [{ startLocation: '2:142:1', endLocation: '2:142:1' }, { startLocation: '0:1:1' }, { endLocation: '1:1:0' },
    { segmentIndex: 1 }, { segmentIndex: -1 }, { markType: 'other' }, { page: 605 }]) {
    const changed = { ...rawAttempt(), marks: [{ ...rawAttempt().marks[0]!, ...patch }] };
    assert.throws(() => decodePassingExam({ ...rawExam(), parts: [{ ...rawExamPart(), attempts: [changed], latestAttempt: changed }] }), isCode('invalid-response'));
  }
});
test('branch creation needs the selected eligible juz; hafiz creation needs at least one eligible part', () => {
  assert.equal(canCreatePassingExam(snapshot(), 1), true); assert.equal(canCreatePassingExam(snapshot(), 2), true);
  for (const juz of [undefined, 0, 3, 31, 1.5]) assert.equal(canCreatePassingExam(snapshot(), juz), false);
  assert.equal(canCreatePassingExam(snapshot('hafiz')), true);
  assert.equal(canCreatePassingExam(decodePassingStudentParts({ parts: [], exams: [] }, 2, 'hafiz')), false);
});
test('open branch exams block only their part; open hafiz exams block another whole exam', () => {
  const branch = snapshot('branch', [rawExam()]);
  assert.equal(canCreatePassingExam(branch, 1), false); assert.equal(canCreatePassingExam(branch, 2), true);
  assert.equal(canCreatePassingExam(snapshot('hafiz', [rawExam('hafiz')])), false);
  const failed = { ...rawAttempt(), mode: 'count' as const, marks: [], rehifzDecision: 'keep' as const,
    result: evaluatePassingPart(policy, { mistakeCount: 4, warningCount: 0, hesitationCount: 0 }) };
  assert.equal(canCreatePassingExam(snapshot('branch', [rawExam('branch', 11, [rawExamPart(1, 21, [failed])])]), 1), false);
});
test('pending decisions block new exams, while saved keep or repeat decisions after passing allow them', () => {
  for (const decision of ['pending', 'keep', 'repeat'] as const) {
    const attempt = { ...rawAttempt(), rehifzDecision: decision, rehifzId: decision === 'repeat' ? 18 : null,
      rehifzStatus: decision === 'repeat' ? 'pending' : null };
    const current = snapshot('branch', [rawExam('branch', 11, [rawExamPart(1, 21, [attempt])])]);
    assert.equal(canCreatePassingExam(current, 1), decision !== 'pending');
  }
});
test('complete snapshots detect eligibility, historical policy, ranges, attempts and decision changes', () => {
  const attempt = rawAttempt(), value = rawParts([rawExam('branch', 11, [rawExamPart(1, 21, [attempt])])]);
  const before = passingSnapshot(decodePassingStudentParts(value, 2, 'branch'));
  assert.equal(before, passingSnapshot(decodePassingStudentParts(structuredClone(value), 2, 'branch')));
  const changedEligibility = structuredClone(value); changedEligibility.parts.pop();
  const changedPolicy = structuredClone(value); changedPolicy.exams[0]!.parts[0]!.attempts[0]!.policy.hesitationDeduction = 0.25;
  changedPolicy.exams[0]!.parts[0]!.latestAttempt = changedPolicy.exams[0]!.parts[0]!.attempts[0]!;
  const changedDecision = structuredClone(value); changedDecision.exams[0]!.parts[0]!.attempts[0]!.rehifzDecision = 'pending';
  changedDecision.exams[0]!.parts[0]!.latestAttempt = changedDecision.exams[0]!.parts[0]!.attempts[0]!;
  const addedExam = structuredClone(value); addedExam.exams.unshift(rawExam('branch', 12, [rawExamPart(2, 22)]));
  const changedRange = structuredClone(value); changedRange.exams[0]!.parts[0]!.ranges[0]!.endAyah = 140;
  for (const changed of [changedEligibility, changedPolicy, changedDecision, addedExam, changedRange]) {
    assert.notEqual(before, passingSnapshot(decodePassingStudentParts(changed, 2, 'branch')));
  }
});
test('reports combine all exam history for a juz and preserve each attempt original ranges and policy', () => {
  const latest = { ...rawAttempt(41, 22), mode: 'count' as const, marks: [] };
  const older = { ...rawAttempt(31, 21), mode: 'count' as const, marks: [], createdAt: '2026-10-10T09:15:00' };
  const newestPart = rawExamPart(1, 22, [latest]); newestPart.ranges[0]!.startAyah = 2;
  const current = snapshot('branch', [rawExam('branch', 12, [newestPart]), rawExam('branch', 11, [rawExamPart(1, 21, [older])])]);
  const report = passingReportPart(current, 1)!; assert.equal(report.juzNumber, 1); assert.equal(report.attempts.length, 2);
  assert.deepEqual(report.attempts.map(attempt => attempt.id), [41, 31]);
  assert.equal(report.attempts[0]!.ranges[0]!.startAyah, 2); assert.equal(report.attempts[1]!.ranges[0]!.startAyah, 1);
  assert.deepEqual(report.attempts[1]!.policy, older.policy); assert.equal(passingReportPart(current, 3), null);
  assert.equal(passingReportPart(snapshot(), 2)!.attempts.length, 0);
  assert.match(passingRangeLabel(range()), /الفاتحة/); assert.match(passingRangeLabel(range()), /البقرة/);
});
test('roster search and complex or circle filters retain only the selected server-supplied students', () => {
  const students = decodePassingStudents([{ ...rawStudent(), name: 'أحمد مُوسى' },
    { ...rawStudent(5), committeeId: 7, committeeName: 'حلقة ثانية' },
    { ...rawStudent(6), complexId: 9, complexName: 'مجمع آخر' }]);
  assert.deepEqual(filterPassingStudents(students, 'احمد موسي', 'all', 'all').map(student => student.id), [2]);
  assert.deepEqual(filterPassingStudents(students, '', '4', '7').map(student => student.id), [5]);
  assert.deepEqual(filterPassingStudents(students, '', '9', '3').map(student => student.id), [6]);
});
test('lists and parts use only the existing permission-scoped endpoints and requested type', async () => {
  const calls: string[] = []; const controller = await setup(async url => { const path = url.replace('https://example.invalid/api', ''); calls.push(path);
    return json(path === '/passing/students' ? [rawStudent()] : rawParts()); });
  const api = createPassingManagementApi(controller);
  assert.equal((await api.students())[0]!.id, 2); assert.equal((await api.parts(2, 'branch')).type, 'branch');
  assert.equal((await api.parts(2, 'hafiz')).type, 'hafiz');
  assert.deepEqual(calls, ['/passing/students', '/passing/students/2/parts?type=branch', '/passing/students/2/parts?type=hafiz']);
});
test('branch creation freshly checks the complete snapshot and sends only student, type and selected juz', async () => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const controller = await setup(async (url, options) => { const path = url.replace('https://example.invalid/api', '');
    calls.push({ path, method: options.method!, body: options.body ? JSON.parse(String(options.body)) : undefined });
    return json(options.method === 'GET' ? rawParts() : rawExam(), options.method === 'GET' ? 200 : 201); });
  const created = await createPassingManagementApi(controller).create(snapshot(), 1);
  assert.equal(created.studentId, 2); assert.equal(created.parts[0]!.juzNumber, 1);
  assert.deepEqual(calls, [{ path: '/passing/students/2/parts?type=branch', method: 'GET', body: undefined },
    { path: '/passing', method: 'POST', body: { studentId: 2, type: 'branch', juz: 1 } }]);
});
test('hafiz creation sends no client ranges, policy or juz and receives all freshly eligible parts', async () => {
  let body: unknown; const controller = await setup(async (_url, options) => {
    if (options.method === 'GET') return json(rawParts()); body = JSON.parse(String(options.body));
    return json(rawExam('hafiz', 11, [rawExamPart(), rawExamPart(2, 22)]), 201); });
  const created = await createPassingManagementApi(controller).create(snapshot('hafiz'));
  assert.deepEqual(body, { studentId: 2, type: 'hafiz' }); assert.deepEqual(created.parts.map(part => part.juzNumber), [1, 2]);
});
test('ineligible parts, open tests and pending decisions cannot send a creation request', async () => {
  let calls = 0; const controller = await setup(async () => { calls++; return json({}); }); const api = createPassingManagementApi(controller);
  const pending = { ...rawAttempt(), rehifzDecision: 'pending' as const };
  for (const [current, juz] of [[snapshot(), 3], [snapshot('branch', [rawExam()]), 1],
    [snapshot('branch', [rawExam('branch', 11, [rawExamPart(1, 21, [pending])])]), 1],
    [decodePassingStudentParts({ parts: [], exams: [] }, 2, 'hafiz'), undefined]] as const) {
    await assert.rejects(api.create(current, juz), isCode('validation'));
  }
  assert.equal(calls, 0);
});
test('changed eligibility, completed tests or historical decisions reject stale creation before POST', async () => {
  const passed = { ...rawAttempt(), mode: 'count' as const, marks: [] };
  for (const fresh of [{ ...rawParts(), parts: rawParts().parts.slice(0, 1) }, rawParts([rawExam()]),
    rawParts([rawExam('branch', 11, [rawExamPart(1, 21, [passed])])])]) {
    let writes = 0; const controller = await setup(async (_url, options) => { if (options.method !== 'GET') writes++; return json(fresh); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode('conflict')); assert.equal(writes, 0);
  }
});
test('server permission, student scope, duplicate-open and validation errors surface without fallback endpoints', async () => {
  for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation']] as const) {
    const paths: string[] = []; const controller = await setup(async (url, options) => {
      paths.push(new URL(url).pathname); return options.method === 'GET' ? json(rawParts()) : json({ message: 'private detail' }, status); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode(code));
    assert.deepEqual(paths, ['/api/passing/students/2/parts', '/api/passing']);
  }
});
test('denied or disconnected fresh reads stop creation before the mutation', async () => {
  for (const denied of [true, false]) {
    let writes = 0; const controller = await setup(async (_url, options) => {
      if (options.method !== 'GET') writes++; if (denied) return json({ internal: 'excluded' }, 403); throw new Error('synthetic unavailable read'); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode(denied ? 'forbidden' : 'network'));
    assert.equal(writes, 0);
  }
});
test('unknown creation outcomes and malformed acknowledgements never automatically retry POST', async () => {
  for (const lost of [true, false]) {
    let writes = 0; const controller = await setup(async (_url, options) => {
      if (options.method === 'GET') return json(rawParts()); writes++;
      if (lost) throw new Error('synthetic connection lost after save'); return json({ ok: true }, 201); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode(lost ? 'network' : 'invalid-response'));
    assert.equal(writes, 1);
  }
});
test('created exam responses cannot switch the requested student or passing type', async () => {
  for (const changed of [{ ...rawExam(), studentId: 9 }, rawExam('hafiz')]) {
    let writes = 0; const controller = await setup(async (_url, options) => {
      if (options.method === 'GET') return json(rawParts()); writes++; return json(changed, 201); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode('invalid-response')); assert.equal(writes, 1);
  }
});
test('created responses must retain the exact freshly eligible parts and ranges with no existing attempt history', async () => {
  const changedRange = rawExam(); changedRange.parts[0]!.ranges[0]!.startAyah = 2;
  const historical = rawExam('branch', 11, [rawExamPart(1, 21, [rawAttempt()])]);
  for (const changed of [rawExam('branch', 11, [rawExamPart(2)]), changedRange, historical]) {
    let writes = 0; const controller = await setup(async (_url, options) => {
      if (options.method === 'GET') return json(rawParts()); writes++; return json(changed, 201); });
    await assert.rejects(createPassingManagementApi(controller).create(snapshot(), 1), isCode('invalid-response')); assert.equal(writes, 1);
  }
  let writes = 0; const controller = await setup(async (_url, options) => {
    if (options.method === 'GET') return json(rawParts()); writes++; return json(rawExam('hafiz'), 201); });
  await assert.rejects(createPassingManagementApi(controller).create(snapshot('hafiz')), isCode('invalid-response')); assert.equal(writes, 1);
});
test('students and staff without quranPassing cannot read or create exams and send no requests', async () => {
  for (const actor of [{ ...identity, role: 'student' as const, dashboardPermissions: ['quranPassing'] },
    { ...identity, role: 'admin' as const, dashboardPermissions: [] }, { ...identity, role: 'supervisor' as const, dashboardPermissions: ['trackSession'] }]) {
    let calls = 0; const controller = await setup(async () => { calls++; return json({}); }, actor); const api = createPassingManagementApi(controller);
    await assert.rejects(api.students(), isCode('forbidden')); await assert.rejects(api.parts(2, 'branch'), isCode('forbidden'));
    await assert.rejects(api.create(snapshot(), 1), isCode('forbidden')); assert.equal(calls, 0);
  }
});
test('quranPassing permits delegated staff reads while server filtering remains authoritative', async () => {
  for (const role of ['admin', 'supervisor'] as const) {
    const controller = await setup(async url => json(url.endsWith('/passing/students') ? [rawStudent()] : rawParts()),
      { ...identity, role, dashboardPermissions: ['quranPassing'] });
    const api = createPassingManagementApi(controller); assert.equal((await api.students()).length, 1); assert.equal((await api.parts(2, 'branch')).studentId, 2);
  }
});
test('revoking the grant during a fresh read cancels creation before POST and rejects the old service afterwards', async () => {
  const actor = { ...identity, role: 'admin' as const, dashboardPermissions: ['quranPassing'] }; let current: NativeSession = actor;
  let release: (() => void) | undefined; let writes = 0;
  const controller = await setup(async (url, options) => {
    if (url.endsWith('/auth/session')) return json(current);
    if (options.method !== 'GET') writes++;
    await new Promise<void>(resolve => { release = resolve; }); return json(rawParts());
  }, actor);
  const api = createPassingManagementApi(controller); const pending = api.create(snapshot(), 1);
  current = { ...actor, dashboardPermissions: [] }; await controller.restore(); release!();
  await assert.rejects(pending, isCode('cancelled')); assert.equal(writes, 0);
  await assert.rejects(api.parts(2, 'branch'), isCode('forbidden'));
});
test('switching account or tenant invalidates old services even when the new account has the same grant', async () => {
  for (const changed of [{ id: 9 }, { complex: { name: 'جهة أخرى', registrationNumber: 'other-fixture' } }]) {
    const actor: NativeSession = { ...identity, role: 'admin', dashboardPermissions: ['quranPassing'] };
    let calls = 0; const controller = await setup(async url => { if (url.endsWith('/auth/logout')) return json({ ok: true }); calls++; return json([rawStudent()]); }, actor);
    const api = createPassingManagementApi(controller); await controller.logout(); Object.assign(actor, changed);
    await controller.login({ loginNumber: '0009', password: 'synthetic' });
    await assert.rejects(api.students(), isCode('cancelled')); assert.equal(calls, 0);
  }
});
test('a late creation response after logout is cancelled rather than exposed to another account', async () => {
  let release: (() => void) | undefined; let writes = 0;
  const controller = await setup(async (url, options) => {
    if (url.endsWith('/auth/logout')) return json({ ok: true });
    if (options.method === 'GET') return json(rawParts()); writes++;
    await new Promise<void>(resolve => { release = resolve; }); return json(rawExam(), 201);
  });
  const pending = createPassingManagementApi(controller).create(snapshot(), 1);
  await new Promise<void>(resolve => { const poll = () => release ? resolve() : setImmediate(poll); poll(); });
  await controller.logout(); release!(); await assert.rejects(pending, isCode('cancelled')); assert.equal(writes, 1);
});
test('invalid student identifiers and aborted reads never reach the transport', async () => {
  let calls = 0; const controller = await setup(async () => { calls++; return json(rawParts()); }); const api = createPassingManagementApi(controller);
  for (const id of [0, -1, 1.5]) await assert.rejects(api.parts(id, 'branch'), isCode('validation'));
  const abort = new AbortController(); abort.abort(); await assert.rejects(api.parts(2, 'branch', abort.signal), isCode('cancelled'));
  assert.equal(calls, 0);
});
