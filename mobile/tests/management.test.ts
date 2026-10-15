import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStudentDraft, filterManagedStudents, normalizeStudentDraft, studentDraft, type ManagedCircle, type ManagedStudent } from '../src/domain/management';
import { availableManagementSections, decodeDashboardFeatures, nativeRegistrationLink } from '../src/domain/dashboardNavigation';
import { createAttendanceLocation } from '../src/domain/attendanceLocation';
import { registrationEntryFromUrl } from '../src/domain/nativeNavigation';
import { createNativeSession, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createManagementApi, decodeManagedStudent } from '../src/services/managementApi';

const circle: ManagedCircle = { id: 3, complexId: 4, name: 'حلقة', complexName: 'مجمع', points: 0, studentsCount: 1 };
const student: ManagedStudent = { id: 2, name: 'أحمد مُوسى', loginNumber: '0002', nationalId: '', guardianPhone: '', phone: '',
  committeeId: 3, committeeName: 'حلقة', complexId: 4, points: 4.25 };
const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [], complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const token = 'a'.repeat(64);
const draft = () => ({ ...emptyStudentDraft(), name: '  أحمد   موسى ', loginNumber: '٠٠٠٢', password: '  ', complexId: '4', committeeId: '3' });
const isCode = (code: string) => (error: unknown) => error instanceof NativeApiError && error.code === code;
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}
test('student management preserves account numbers and passwords while normalizing contact and Arabic names', () => {
  const payload = normalizeStudentDraft({ ...draft(), guardianPhone: '+٩٦٦ ٥٠١-٢٣٤-٥٦٧', nationalId: '١٠٠٠٠٠٠٠٠٢' }, [circle]);
  assert.equal(payload.name, 'أحمد موسى'); assert.equal(payload.loginNumber, '0002'); assert.equal(payload.password, '  ');
  assert.equal(payload.guardianPhone, '966501234567'); assert.equal(payload.nationalId, '1000000002');
  assert.equal(studentDraft(student).password, ''); assert.equal(studentDraft(student).committeeId, '3');
});
test('student management rejects invalid placement, blank edit passwords and unsafe grade changes', () => {
  for (const partial of [{ name: 'س' }, { loginNumber: '12x' }, { password: '' }, { password: 'x'.repeat(257) }, { complexId: '5' },
    { committeeId: '-1' }, { gradeAdjustmentAmount: '5', gradeAdjustmentReason: 'خصم', gradeAdjustmentType: 'deduction' as const },
    { gradeAdjustmentAmount: '1', gradeAdjustmentReason: '' }, { gradeAdjustmentAmount: 'NaN' }, { gradeAdjustmentAmount: '-1' }]) {
    assert.throws(() => normalizeStudentDraft({ ...draft(), ...partial }, [circle], student.points));
  }
  const valid = normalizeStudentDraft({ ...draft(), gradeAdjustmentAmount: '4.25', gradeAdjustmentReason: 'تصحيح', gradeAdjustmentType: 'deduction' }, [circle], student.points);
  assert.equal(valid.gradeAdjustmentAmount, '4.25'); assert.equal('points' in valid, false);
  assert.equal(normalizeStudentDraft({ ...draft(), gradeAdjustmentAmount: '٤٫٢٥', gradeAdjustmentReason: 'تصحيح' }, [circle], 0).gradeAdjustmentAmount, '4.25');
});
test('student filters handle Arabic spelling, multiple terms, unassigned circles and complex boundaries', () => {
  const other = { ...student, id: 5, name: 'طالب آخر', committeeId: null, complexId: null };
  assert.deepEqual(filterManagedStudents([student, other], 'احمد موسي', 'all', '4'), [student]);
  assert.deepEqual(filterManagedStudents([student, other], '', 'none', 'all'), [other]);
  assert.equal(filterManagedStudents([student], '', '3', '9').length, 0);
});
test('management refuses privacy-limited or malformed student responses', () => {
  assert.throws(() => decodeManagedStudent({ id: 2, name: 'طالب', points: 4 }), isCode('invalid-response'));
  assert.throws(() => decodeManagedStudent({ ...student, points: 'unsafe' }), isCode('invalid-response'));
  assert.equal(decodeManagedStudent({ ...student, points: '4.25' }).points, 4.25);
});
test('navigation follows live grants and actual feature switches with no invented roles', () => {
  const features = decodeDashboardFeatures({ registrationRequestsSectionEnabled: true, studentsSectionEnabled: true, committeesSectionEnabled: false,
    usersRolesSectionEnabled: false, studentPlansSectionEnabled: false, attendanceManualEnabled: false, recitationAttendanceSource: 'supervisor', narrationSectionEnabled: false, reportsSectionEnabled: false, storeSectionEnabled: false });
  assert.deepEqual(availableManagementSections(identity, features).map(section => section.key), ['registrationRequests', 'students', 'weeklySession', 'trackSession', 'quranPassing', 'news', 'notifications']);
  assert.deepEqual(availableManagementSections({ ...identity, role: 'admin', dashboardPermissions: ['students'] }, features).map(section => section.key), ['students']);
  assert.equal(availableManagementSections({ ...identity, role: 'admin', dashboardPermissions: [] }, features).length, 0);
  assert.equal(availableManagementSections({ ...identity, role: 'student', dashboardPermissions: ['students'] }, features).length, 0);
  assert.throws(() => decodeDashboardFeatures({ studentsSectionEnabled: 'true' }), isCode('invalid-response'));
});
test('shared registration link opens the correct tenant and accepts no API override', () => {
  const link = nativeRegistrationLink('native-fixture');
  assert.deepEqual(registrationEntryFromUrl(link), { registrationNumber: 'native-fixture' });
  assert.equal(nativeRegistrationLink(''), ''); assert.equal(nativeRegistrationLink('invalid/tenant'), '');
});
test('management sends only existing CRUD contracts and does not write final balances', async () => {
  const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const controller = await setup(async (url, options) => {
    const path = new URL(url).pathname.replace('/api', ''); const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : null;
    calls.push({ path, method: options.method ?? 'GET', body });
    if (path === '/students' && options.method === 'POST') return json(student, 201);
    if (path.startsWith('/families') && options.method === 'DELETE') return json({ ok: true, detachedStudents: 2 });
    if (path.startsWith('/complexes')) return json({ id: 4, name: 'مجمع' });
    return json({ ok: true });
  });
  const api = createManagementApi(controller); await api.saveStudent(draft(), [circle]);
  await api.saveStudent({ ...draft(), gradeAdjustmentAmount: '1', gradeAdjustmentReason: 'تصحيح' }, [circle], student);
  await api.moveStudent(2, 3, [circle]); await api.deleteStudent(2); assert.equal(await api.deleteCircle(3), 2);
  await api.saveComplex('مجمع', 4);
  assert.deepEqual(calls.map(call => [call.method, call.path]), [['POST', '/students'], ['PUT', '/students/2'], ['PATCH', '/students/2/committee'],
    ['DELETE', '/students/2'], ['DELETE', '/families/3'], ['PUT', '/complexes/4']]);
  assert.equal(calls.some(call => call.body && ('token' in call.body || 'points' in call.body || 'role' in call.body)), false);
});
test('ungranted administrators cannot make management requests and server permission failures surface', async () => {
  let requests = 0;
  const controller = await setup(async () => { requests += 1; return json({ message: 'private detail' }, 403); }, { ...identity, role: 'admin', dashboardPermissions: [] });
  await assert.rejects(createManagementApi(controller).loadStudents(), isCode('forbidden')); assert.equal(requests, 0);
  const granted = await setup(async () => json({ message: 'private detail' }, 403), { ...identity, role: 'admin', dashboardPermissions: ['students'] });
  await assert.rejects(createManagementApi(granted).deleteStudent(2), isCode('forbidden'));
});
test('management rejects an old service after account/tenant switch and grant revocation', async () => {
  let session = { ...identity, role: 'admin' as const, dashboardPermissions: ['students'] };
  const actor = { ...session };
  const controller = await setup(async url => url.endsWith('/auth/session') ? json(session) : json({ ok: true }), actor);
  const api = createManagementApi(controller); session = { ...session, dashboardPermissions: [] }; await controller.restore();
  await assert.rejects(api.deleteStudent(2), isCode('forbidden'));
  await controller.logout(); Object.assign(actor, { id: 9, dashboardPermissions: ['students'] });
  await controller.login({ loginNumber: '0009', password: 'synthetic' });
  await assert.rejects(api.deleteStudent(2), isCode('cancelled'));
});
test('location requests stop before reading coordinates when permission or services fail', async () => {
  let reads = 0;
  const position = async () => { reads += 1; return { latitude: 24, longitude: 46 }; };
  await assert.rejects(createAttendanceLocation({ permissions: async () => false, enabled: async () => true, position })(), /اسمح/);
  await assert.rejects(createAttendanceLocation({ permissions: async () => true, enabled: async () => false, position })(), /شغّل/);
  assert.equal(reads, 0);
  assert.deepEqual(await createAttendanceLocation({ permissions: async () => true, enabled: async () => true, position })(), { latitude: 24, longitude: 46 });
});
test('location rejects impossible coordinates and safely explains provider failure', async () => {
  for (const position of [async () => ({ latitude: NaN, longitude: 46 }), async () => ({ latitude: 91, longitude: 46 }),
    async () => ({ latitude: 24, longitude: -181 }), async () => { throw new Error('private provider detail'); }]) {
    await assert.rejects(createAttendanceLocation({ permissions: async () => true, enabled: async () => true, position })(), /تعذّر/);
  }
});
