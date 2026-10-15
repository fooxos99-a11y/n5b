import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageRegistration, completedRegistrationTests, decodeRegistrationAcceptance, decodeRegistrationAction,
  decodeRegistrationManagementCommittees, decodeRegistrationOpenState, decodeRegistrationRequests, filterRegistrationRequests,
  initialRegistrationAcceptanceForm, registrationAcceptanceCommittees, registrationActionMessage, registrationManagementComplexes,
  registrationManagementDate, registrationManagementFailure, registrationMemorizationLabel, registrationMutationNeedsReload,
  updateRegistrationAcceptanceForm, validateRegistrationAcceptance, type ManagedRegistrationRequest, type RegistrationAcceptanceForm,
  type RegistrationAcceptancePayload, type RegistrationManagementCommittee } from '../src/domain/registrationManagement';
import type { NativeSession, NativeSessionController, NativeSessionSnapshot } from '../src/domain/nativeSession';
import { NativeApiError } from '../src/services/nativeApi';
import { createRegistrationManagementApi } from '../src/services/registrationManagementApi';

const request: ManagedRegistrationRequest = {
  id: 9, name: 'طالب اختبار', guardianPhone: '0500000000', nationalId: '1000000001', age: 12,
  complexId: 1, complexName: 'مجمع أول', committeeId: 7, committeeName: 'حلقة أولى',
  memorization: { items: [{ id: 'juz-1', type: 'juz', label: 'الجزء 1', juz: 1 },
    { id: 'range-1', type: 'range', label: 'نطاق جزئي للاختبار', juz: 2 }], juzs: [1, 2] },
  testResults: {}, preliminarySentAt: null, createdAt: '2026-10-14 10:00:00',
};
const committees: RegistrationManagementCommittee[] = [
  { id: 7, name: 'حلقة أولى', complexId: 1, complexName: 'مجمع أول' },
  { id: 8, name: 'حلقة ثانية', complexId: 2, complexName: 'مجمع ثانٍ' },
  { id: 10, name: 'حلقة أخرى', complexId: 1, complexName: 'مجمع أول' },
  { id: 11, name: 'حلقة غير مرتبطة', complexId: null, complexName: '' },
];
const form: RegistrationAcceptanceForm = { ...initialRegistrationAcceptanceForm(request), password: '  كلمة مرور اختبار  ' };
const results = { 'juz-1': 'passed', 'range-1': 'failed' } as const;
const session: NativeSession = { role: 'manager', id: 1, name: 'مدير اختبار', dashboardPermissions: [], complex: { registrationNumber: 'tenant-a', name: 'جهة اختبار' } };
const authenticated = (identity = session): NativeSessionSnapshot => ({ status: 'authenticated', session: identity, error: null });

function fakeController(handler: (path: string, options?: Parameters<NativeSessionController['request']>[1]) => unknown | Promise<unknown>, initial = authenticated()) {
  let snapshot = initial;
  const calls: { path: string; options: Parameters<NativeSessionController['request']>[1] }[] = [];
  const request: NativeSessionController['request'] = async <T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (body: unknown) => T) => {
    calls.push({ path, options });
    const body = await handler(path, options);
    return decode ? decode(body) : body as T;
  };
  return { controller: { getSnapshot: () => snapshot, request }, calls, setSnapshot: (value: NativeSessionSnapshot) => { snapshot = value; } };
}

function validPayload(changes: Partial<RegistrationAcceptanceForm> = {}): RegistrationAcceptancePayload {
  const validated = validateRegistrationAcceptance(request, { ...form, ...changes }, results, committees);
  if (!validated.valid) assert.fail(validated.message);
  return validated.payload;
}
const accepted = { ok: true, student: { id: 30, name: request.name, loginNumber: '1000000001', guardianPhone: request.guardianPhone,
  nationalId: request.nationalId, age: 12, complexId: 1, complexName: 'مجمع أول', committeeId: 7, committeeName: 'حلقة أولى' } };

test('acceptance prefill never carries a password and uses the existing national identity as login default', () => {
  assert.deepEqual(initialRegistrationAcceptanceForm(request), { ...form, password: '' });
  assert.equal(initialRegistrationAcceptanceForm({ ...request, nationalId: '' }).loginNumber, '');
});

test('final acceptance requires complete tests but permits failed results and no preliminary acceptance', () => {
  const payload = validPayload();
  assert.equal(payload.password, form.password);
  assert.deepEqual(payload.testResults, results);
  assert.equal('memorization' in payload, false);
  assert.equal(validateRegistrationAcceptance(request, form, { 'juz-1': 'passed' }, committees).valid, false);
  assert.equal(validateRegistrationAcceptance(request, form, { 'juz-1': 'failed', 'range-1': 'failed' }, committees).valid, true);
  assert.equal(completedRegistrationTests(request, results), true);
  assert.equal(validateRegistrationAcceptance({ ...request, memorization: { items: [], juzs: [] } }, form, {}, committees).valid, true);
});

test('only request memorization keys enter the final payload, and numeric identifiers remain text', () => {
  const validated = validateRegistrationAcceptance(request, { ...form, name: '  طالب   اختبار  ', loginNumber: '٠٠١٢٣' },
    { ...results, other: 'passed' }, committees);
  if (!validated.valid) assert.fail(validated.message);
  assert.equal(validated.payload.name, 'طالب اختبار');
  assert.equal(validated.payload.loginNumber, '00123');
  assert.deepEqual(validated.payload.testResults, results);
  assert.equal(validPayload({ loginNumber: '9'.repeat(80) }).loginNumber, '9'.repeat(80));
});

test('acceptance enforces server password and age boundaries without trimming passwords', () => {
  for (const password of ['', 'x'.repeat(257)]) assert.equal(validateRegistrationAcceptance(request, { ...form, password }, results, committees).valid, false);
  for (const age of ['', '3', '121', 'غير رقمي']) assert.equal(validateRegistrationAcceptance(request, { ...form, age }, results, committees).valid, false);
  for (const age of ['4', '120', '١٢']) assert.equal(validateRegistrationAcceptance(request, { ...form, age }, results, committees).valid, true);
  assert.equal(validPayload({ password: ' ' }).password, ' ');
  for (const loginNumber of ['', '123abc', '9'.repeat(81)]) assert.equal(validateRegistrationAcceptance(request, { ...form, loginNumber }, results, committees).valid, false);
  for (const name of ['', ' '.repeat(8), 'أ'.repeat(181)]) assert.equal(validateRegistrationAcceptance(request, { ...form, name }, results, committees).valid, false);
  assert.equal(validateRegistrationAcceptance(request, { ...form, name: 'أ' }, results, committees).valid, true);
});

test('optional contacts use the same shared server rules and preserve optionality', () => {
  const payload = validPayload({ guardianPhone: '+٩٦٦ (٥٠) ٠٠٠-٠٠٠٠', nationalId: '١٠٠٠٠٠٠٠٠١' });
  assert.equal(payload.guardianPhone, '966500000000');
  assert.equal(payload.nationalId, '1000000001');
  assert.equal(validPayload({ guardianPhone: '', nationalId: '' }).guardianPhone, '');
  for (const guardianPhone of ['12345678', '9'.repeat(16), 'phone123456789']) assert.equal(validateRegistrationAcceptance(request, { ...form, guardianPhone }, results, committees).valid, false);
  for (const nationalId of ['123456789', '9'.repeat(11), '١٢٣-٤٥٦٧٨٩٠']) assert.equal(validateRegistrationAcceptance(request, { ...form, nationalId }, results, committees).valid, false);
});

test('placement derives available complexes, resets changed circles and rejects mismatched or unavailable placement', () => {
  assert.deepEqual(registrationManagementComplexes(committees), [{ id: 1, name: 'مجمع أول' }, { id: 2, name: 'مجمع ثانٍ' }]);
  assert.deepEqual(registrationAcceptanceCommittees(committees, '1').map(circle => circle.id), [7, 10]);
  assert.equal(updateRegistrationAcceptanceForm(form, 'complexId', '2').committeeId, '');
  assert.equal(updateRegistrationAcceptanceForm(form, 'complexId', '1').committeeId, '7');
  for (const changes of [{ complexId: '' }, { complexId: '999' }, { committeeId: '8' }, { committeeId: '11' }]) assert.equal(validateRegistrationAcceptance(request, { ...form, ...changes }, results, committees).valid, false);
});

test('local search and filters distinguish recorded preliminary acceptance without assuming delivery', () => {
  const rows = [request, { ...request, id: 10, name: 'طالب ثانٍ', preliminarySentAt: '2026-10-14 11:00:00' }];
  assert.equal(filterRegistrationRequests(rows, '', 'all').length, 2);
  assert.deepEqual(filterRegistrationRequests(rows, '', 'preliminary').map(row => row.id), [10]);
  assert.deepEqual(filterRegistrationRequests(rows, '', 'pending-preliminary').map(row => row.id), [9]);
  assert.equal(filterRegistrationRequests(rows, '١٠٠٠٠٠٠٠٠١', 'all').length, 2);
  assert.equal(filterRegistrationRequests(rows, 'ثانٍ', 'preliminary').length, 1);
  assert.equal(filterRegistrationRequests(rows, 'لا يوجد', 'all').length, 0);
});

test('request decoder preserves actual nullable fields, full and partial labels, and incomplete test state', () => {
  const decoded = decodeRegistrationRequests({ registrationEnabled: true, requests: [{ ...request, guardianPhone: null,
    committeeId: null, committeeName: null, testResults: { 'juz-1': 'passed', 'range-1': 'pending' }, password: 'must-not-enter-the-model' }] });
  const row = decoded.requests[0];
  assert.ok(row);
  assert.equal(row.guardianPhone, '');
  assert.equal(row.committeeId, null);
  assert.deepEqual(row.testResults, { 'juz-1': 'passed' });
  assert.equal(row.memorization.items[1]?.type, 'range');
  assert.equal('password' in row, false);
  assert.equal(completedRegistrationTests(row, row.testResults), false);
  assert.deepEqual(decodeRegistrationManagementCommittees(committees), committees);
  assert.equal(decodeRegistrationOpenState({ registrationEnabled: false }), false);
});

test('decoders reject malformed identities, duplicate item keys and misleading delivery responses', () => {
  for (const response of [null, {}, { registrationEnabled: 'true', requests: [] }, { registrationEnabled: true, requests: [{ ...request, id: 0 }] },
    { registrationEnabled: true, requests: [{ ...request, memorization: { items: [request.memorization.items[0], request.memorization.items[0]], juzs: [1] } }] },
    { registrationEnabled: true, requests: [{ ...request, memorization: { items: [{ id: '__proto__', type: 'juz', label: 'x', juz: 1 }], juzs: [1] } }] }]) assert.throws(() => decodeRegistrationRequests(response));
  for (const response of [{ ok: false }, { ok: true, deliveryStatus: ['sent'] }, { ok: true, deliveryStatus: 'unknown' }]) assert.throws(() => decodeRegistrationAction(response));
  assert.throws(() => decodeRegistrationAcceptance({ ...accepted, student: { ...accepted.student, complexId: 0 } }));
  assert.throws(() => decodeRegistrationManagementCommittees({}));
});

test('missing or failed communication does not erase confirmed acceptance or falsely claim message delivery', () => {
  assert.deepEqual(decodeRegistrationAction({ ok: true }), { ok: true, deliveryStatus: null });
  assert.equal(registrationActionMessage('accept', 'failed'), 'أُنشئ حساب الطالب. تعذر إرسال رسالة التواصل.');
  assert.equal(registrationActionMessage('reject', 'sent'), 'رُفض الطلب وحُذف. أُرسلت رسالة التواصل.');
  assert.equal(registrationActionMessage('preliminary', null).includes('لا يوجد تأكيد'), true);
  assert.equal(decodeRegistrationAcceptance(accepted).student.id, 30);
});

test('safe failures separate conflicts, scope denial and uncertain mutation without exposing response messages', () => {
  for (const status of [401, 403, 404, 409, 422, 429, 500]) assert.equal(registrationManagementFailure({ status, message: 'private password token SQL' }).includes('private'), false);
  assert.equal(registrationManagementFailure({ status: 409 }).includes('رقم الدخول أو الهوية'), true);
  assert.equal(registrationMutationNeedsReload(new NativeApiError('network')), true);
  assert.equal(registrationMutationNeedsReload(new NativeApiError('invalid-response')), true);
  assert.equal(registrationMutationNeedsReload(new NativeApiError('server', 500)), true);
  assert.equal(registrationMutationNeedsReload(new NativeApiError('conflict', 409)), false);
  assert.equal(registrationMutationNeedsReload(new NativeApiError('validation', 422)), false);
});

test('dates and memorization summaries use the current web helpers and handle empty values', () => {
  assert.equal(registrationManagementDate(null), '—');
  assert.equal(registrationManagementDate('invalid'), '—');
  assert.notEqual(registrationManagementDate(request.createdAt), '—');
  assert.equal(registrationMemorizationLabel({ ...request, memorization: { items: [], juzs: [] } }), 'لا يوجد محفوظ سابق');
});

test('manager or explicitly granted staff may manage, while student and ungranted staff cannot', () => {
  assert.equal(canManageRegistration(session), true);
  for (const role of ['supervisor', 'admin'] as const) {
    assert.equal(canManageRegistration({ ...session, role }), false);
    assert.equal(canManageRegistration({ ...session, role, dashboardPermissions: ['registrationRequests'] }), true);
  }
  assert.equal(canManageRegistration({ ...session, role: 'student', dashboardPermissions: ['registrationRequests'] }), false);
});

test('management API uses all actual endpoints and delegates protected context without persisting credentials', async () => {
  const fake = fakeController(path => path === '/registration-requests' ? { registrationEnabled: true, requests: [request] }
    : path === '/committees' ? committees : path.endsWith('/config') ? { registrationEnabled: false }
      : path.endsWith('/accept') ? accepted : { ok: true, deliveryStatus: 'failed' });
  const api = createRegistrationManagementApi(fake.controller), signal = new AbortController().signal;
  assert.equal((await api.load(signal)).requests[0]?.id, 9);
  assert.equal(await api.setOpen(false, signal), false);
  assert.equal((await api.preliminaryAccept(9, signal)).deliveryStatus, 'failed');
  await api.reject(9, signal);
  await api.accept(9, validPayload(), signal);
  assert.deepEqual(fake.calls.map(call => call.path), ['/registration-requests', '/committees', '/registration-requests/config',
    '/registration-requests/9/preliminary-accept', '/registration-requests/9/reject', '/registration-requests/9/accept']);
  assert.deepEqual(fake.calls[2]?.options?.body, { registrationEnabled: false });
  assert.equal((fake.calls[5]?.options?.body as RegistrationAcceptancePayload).password, form.password);
  for (const call of fake.calls) { assert.equal(call.options?.signal, signal); assert.equal('token' in (call.options || {}), false); assert.equal('registrationNumber' in (call.options || {}), false); }
});

test('invalid request ids never reach transport', () => {
  const fake = fakeController(() => ({ ok: true })), api = createRegistrationManagementApi(fake.controller);
  for (const id of [0, -1, 1.5, Infinity]) assert.throws(() => api.preliminaryAccept(id), error => error instanceof NativeApiError && error.code === 'validation');
  assert.equal(fake.calls.length, 0);
});

test('an old service cannot send into a switched account, role or tenant', async () => {
  const fake = fakeController(() => ({ registrationEnabled: true })), api = createRegistrationManagementApi(fake.controller);
  for (const changed of [{ ...session, id: 2 }, { ...session, role: 'admin' as const, dashboardPermissions: ['registrationRequests'] },
    { ...session, complex: { ...session.complex, registrationNumber: 'tenant-b' } }]) {
    fake.setSnapshot(authenticated(changed));
    await assert.rejects(api.setOpen(true), error => error instanceof NativeApiError && error.code === 'forbidden');
  }
  assert.equal(fake.calls.length, 0);
});

test('revoked grants and unauthenticated snapshots block service construction or later requests', async () => {
  const staff = { ...session, role: 'admin' as const, dashboardPermissions: ['registrationRequests'] };
  const fake = fakeController(() => ({ registrationEnabled: true }), authenticated(staff)), api = createRegistrationManagementApi(fake.controller);
  fake.setSnapshot(authenticated({ ...staff, dashboardPermissions: [] }));
  await assert.rejects(api.setOpen(true), error => error instanceof NativeApiError && error.code === 'forbidden');
  fake.setSnapshot({ status: 'signed-out', session: null, error: null });
  await assert.rejects(api.setOpen(true), error => error instanceof NativeApiError && error.code === 'unauthorized');
  assert.throws(() => createRegistrationManagementApi(fake.controller), error => error instanceof NativeApiError && error.code === 'unauthorized');
  assert.equal(fake.calls.length, 0);
});

test('late responses are rejected after account switch or revocation even when the transport ignores cancellation', async () => {
  for (const switchAccount of [true, false]) {
    const staff = { ...session, role: 'admin' as const, dashboardPermissions: ['registrationRequests'] };
    let finish: ((body: unknown) => void) | undefined;
    const fake = fakeController(() => new Promise(resolve => { finish = resolve; }), authenticated(staff));
    const pending = createRegistrationManagementApi(fake.controller).setOpen(true);
    assert.ok(finish);
    fake.setSnapshot(authenticated(switchAccount ? { ...staff, id: 2 } : { ...staff, dashboardPermissions: [] }));
    finish({ registrationEnabled: true });
    await assert.rejects(pending, error => error instanceof NativeApiError && error.code === 'forbidden');
    assert.equal(fake.calls.length, 1);
  }
});
