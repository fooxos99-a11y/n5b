import assert from 'node:assert/strict';
import test from 'node:test';
import { availableManagementSections, decodeDashboardFeatures } from '../src/domain/dashboardNavigation';
import type { NativeSession } from '../src/domain/nativeSession';
import { NativeApiError } from '../src/services/nativeApi';

const identity: NativeSession = { role: 'manager', id: 1, name: 'حساب اختبار', dashboardPermissions: [],
  complex: { name: 'جهة اختبار', registrationNumber: 'native-fixture' } };
const switches = { registrationRequestsSectionEnabled: true, studentsSectionEnabled: true, committeesSectionEnabled: true,
  usersRolesSectionEnabled: true, studentPlansSectionEnabled: true, attendanceManualEnabled: true, recitationAttendanceSource: 'supervisor', narrationSectionEnabled: true, reportsSectionEnabled: false, storeSectionEnabled: false, storeEnabled: false };
const sections = (session: NativeSession, values = switches) => availableManagementSections(session, decodeDashboardFeatures(values)).map(row => row.key);

test('staff and plan navigation follows the same switches and grants as the current dashboard', () => {
  assert.deepEqual(sections(identity), ['registrationRequests', 'students', 'families', 'supervisors', 'administrators', 'studentPlans', 'manualAttendance', 'weeklySession', 'trackSession', 'narrationDay', 'quranPassing', 'news', 'notifications']);
  for (const grant of ['supervisors', 'administrators', 'studentPlans'] as const) {
    assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: [grant] }), [grant]);
  }
  assert.deepEqual(sections({ ...identity, role: 'supervisor', dashboardPermissions: ['studentPlans', 'reports', 'calls', 'quranEvaluation'] }), ['studentPlans', 'reports']);
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: [] }), []);
  assert.deepEqual(sections({ ...identity, role: 'student', dashboardPermissions: ['supervisors', 'administrators', 'studentPlans'] }), []);
});

test('feature revocation blocks staff and plan screens even with all grants', () => {
  assert.deepEqual(sections(identity, { ...switches, usersRolesSectionEnabled: false, studentPlansSectionEnabled: false }),
    ['registrationRequests', 'students', 'families', 'manualAttendance', 'weeklySession', 'trackSession', 'narrationDay', 'quranPassing', 'news', 'notifications']);
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['studentPlans'] },
    { ...switches, studentPlansSectionEnabled: false }), []);
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['supervisors'] },
    { ...switches, usersRolesSectionEnabled: false }), []);
});

test('session sections use live grants and legacy grades without invented feature switches', () => {
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['grades'] }), ['weeklySession', 'trackSession']);
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['weeklySession'] }), ['weeklySession']);
  assert.deepEqual(sections({ ...identity, role: 'supervisor', dashboardPermissions: ['trackSession'] }), ['trackSession', 'reports']);
  assert.deepEqual(sections({ ...identity, role: 'student', dashboardPermissions: ['manualAttendance', 'weeklySession', 'trackSession'] }), []);
});

test('manual attendance preserves current source, enable switch and supervisor exception', () => {
  const grant = { ...identity, role: 'admin' as const, dashboardPermissions: ['manualAttendance'] };
  assert.deepEqual(sections(grant), ['manualAttendance']);
  assert.deepEqual(sections(grant, { ...switches, attendanceManualEnabled: false }), []);
  assert.deepEqual(sections(grant, { ...switches, recitationAttendanceSource: 'teacher' }), []);
  assert.deepEqual(sections({ ...grant, role: 'supervisor' }, { ...switches, attendanceManualEnabled: false, recitationAttendanceSource: 'teacher' }), ['manualAttendance', 'reports']);
  for (const value of [{ ...switches, attendanceManualEnabled: 'true' }, { ...switches, recitationAttendanceSource: 'invented' }])
    assert.throws(() => decodeDashboardFeatures(value), error => error instanceof NativeApiError && error.code === 'invalid-response');
});

test('incomplete or untrusted feature responses do not expose management navigation', () => {
  for (const values of [{ ...switches, usersRolesSectionEnabled: undefined }, { ...switches, studentPlansSectionEnabled: 'true' }, null]) {
    assert.throws(() => decodeDashboardFeatures(values), error => error instanceof NativeApiError && error.code === 'invalid-response');
  }
});

test('narration uses its actual feature switch while passing requires its own grant without an invented switch', () => {
  const admin = { ...identity, role: 'admin' as const, dashboardPermissions: ['narrationDay', 'quranPassing'] };
  assert.deepEqual(sections(admin), ['narrationDay', 'quranPassing']);
  assert.deepEqual(sections(admin, { ...switches, narrationSectionEnabled: false }), ['quranPassing']);
  assert.deepEqual(sections({ ...admin, dashboardPermissions: ['grades'] }), ['weeklySession', 'trackSession']);
  assert.deepEqual(sections({ ...admin, role: 'supervisor' }), ['narrationDay', 'quranPassing', 'reports']);
  assert.deepEqual(sections({ ...admin, role: 'student' }), []);
  for (const invalid of [undefined, 'true', 1]) assert.throws(() => decodeDashboardFeatures({ ...switches, narrationSectionEnabled: invalid }),
    error => error instanceof NativeApiError && error.code === 'invalid-response');
  assert.equal(decodeDashboardFeatures({ ...switches, quranPassingSectionEnabled: false }).quranPassing, true);
});

test('management reports follow their feature and grant while preserving supervisor own reports', () => {
  const enabled = { ...switches, reportsSectionEnabled: true };
  for (const role of ['manager', 'admin'] as const) {
    const actor = { ...identity, role, dashboardPermissions: ['reports'] };
    assert.equal(sections(actor, enabled).includes('reports'), true);
    assert.equal(sections(actor, switches).includes('reports'), false);
  }
  assert.deepEqual(sections({ ...identity, role: 'supervisor', dashboardPermissions: [] }), ['reports']);
  for (const grants of [[], ['weeklySession'], ['trackSession'], ['grades'], ['manualAttendance']]) {
    assert.equal(sections({ ...identity, role: 'admin', dashboardPermissions: grants }, enabled).includes('reports'), false);
  }
  for (const [grants, expected] of [
    [['reports'], ['reports']],
    [['weeklySession', 'reports'], ['weeklySession', 'reports']],
    [['trackSession', 'reports'], ['trackSession', 'reports']],
    [['weeklySession', 'trackSession', 'reports'], ['weeklySession', 'trackSession', 'reports']],
    [['grades', 'reports'], ['weeklySession', 'trackSession', 'reports']],
  ]) assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: grants! }, enabled), expected);
  assert.deepEqual(sections({ ...identity, role: 'student', dashboardPermissions: ['reports'] }, enabled), []);
  for (const invalid of [undefined, 'true', 1]) assert.throws(() => decodeDashboardFeatures({ ...switches, reportsSectionEnabled: invalid }),
    error => error instanceof NativeApiError && error.code === 'invalid-response');
});

test('store management needs its section and live grant while the student follows store availability', () => {
  const enabled = { ...switches, storeSectionEnabled: true, storeEnabled: true };
  for (const role of ['manager', 'admin', 'supervisor'] as const) {
    const actor = { ...identity, role, dashboardPermissions: ['store'] };
    assert.equal(sections(actor, enabled).includes('store'), true);
    assert.equal(sections(actor, { ...enabled, storeSectionEnabled: false }).includes('store'), false);
  }
  assert.equal(sections({ ...identity, role: 'admin', dashboardPermissions: [] }, enabled).includes('store'), false);
  const student = { ...identity, role: 'student' as const, dashboardPermissions: ['store', 'students', 'reports'] };
  for (const storeSectionEnabled of [true, false]) {
    assert.deepEqual(availableManagementSections(student, decodeDashboardFeatures({ ...enabled, storeSectionEnabled }, 'student')).map(row => row.key), ['store']);
  }
  assert.deepEqual(availableManagementSections(student, decodeDashboardFeatures({ ...enabled, storeEnabled: false }, 'student')), []);
  for (const value of [undefined, 'true', 1]) {
    assert.throws(() => decodeDashboardFeatures({ ...enabled, storeSectionEnabled: value }), NativeApiError);
    assert.throws(() => decodeDashboardFeatures({ ...enabled, storeEnabled: value }, 'student'), NativeApiError);
  }
});


test('news follows settings and broadcasts follow notifications without invented switches', () => {
  for (const role of ['manager', 'admin', 'supervisor'] as const) {
    const actor = { ...identity, role, dashboardPermissions: ['settings', 'notifications'] };
    const exposed = sections(actor);
    assert.equal(exposed.includes('news'), true);
    assert.equal(exposed.includes('notifications'), true);
  }
  for (const grant of [[], ['news'], ['reports'], ['store']]) {
    const exposed = sections({ ...identity, role: 'admin', dashboardPermissions: grant });
    assert.equal(exposed.includes('news'), false); assert.equal(exposed.includes('notifications'), false);
  }
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['settings'] }), ['news']);
  assert.deepEqual(sections({ ...identity, role: 'admin', dashboardPermissions: ['notifications'] }), ['notifications']);
  assert.deepEqual(sections({ ...identity, role: 'student', dashboardPermissions: ['settings', 'notifications'] }), []);
  assert.equal(decodeDashboardFeatures({ ...switches, newsSectionEnabled: false, notificationsSectionEnabled: false }).news, true);
});
