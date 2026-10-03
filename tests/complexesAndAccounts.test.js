import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeDashboardGrants, gradingPermissionForComponent, scopeSessionGrade } from '../shared/dashboard-permissions.js';
import { assertStudentComplex, requireComplex } from '../server/services/complexes.js';
import { assertAdministratorScope } from '../server/services/administratorScope.js';
import { hashStudentPassword, verifyStudentPassword } from '../server/services/studentPassword.js';
import { parseStudentRows } from '../src/lib/studentImport.js';

test('legacy session grants expand while separate grants do not authorize the other session', () => {
  assert.deepEqual(normalizeDashboardGrants(['grades', 'grades', 'invalid']), ['weeklySession', 'trackSession']);
  assert.deepEqual(normalizeDashboardGrants(['weeklySession']), ['weeklySession']);
  assert.equal(gradingPermissionForComponent('track'), 'trackSession');
  assert.equal(gradingPermissionForComponent('weekly'), 'weeklySession');
  assert.equal(gradingPermissionForComponent('invalid'), null);
  const grade = { total: 80, trackSession: { grade: 20 }, trackDetail: { segments: [1] }, weeklySession: { grade: 10 }, weeklyDetail: { attended: true } };
  assert.deepEqual(scopeSessionGrade(grade, ['weeklySession']), { weeklySession: grade.weeklySession, weeklyDetail: grade.weeklyDetail });
  assert.deepEqual(scopeSessionGrade(grade, ['trackSession']), { trackSession: grade.trackSession, trackDetail: grade.trackDetail });
  assert.deepEqual(scopeSessionGrade(grade, []), {});
  assert.equal(scopeSessionGrade(grade, ['grades']), grade);
});

test('student circle must belong to the selected complex, including direct imports', async () => {
  const connection = { query: async (sql, [id]) => sql.includes('FROM complexes') ? [id === 1 ? [{ id }] : []] : [[{ complexId: id === 7 ? 1 : null }]] };
  await assertStudentComplex(connection, 7, 1);
  await assertStudentComplex(connection, 7, undefined);
  for (const id of [null, 0, -1, 'text', 2]) await assert.rejects(requireComplex(connection, id), { statusCode: 422 });
  await assert.rejects(assertStudentComplex(connection, 8, 1), { statusCode: 422 });
  await assert.rejects(assertStudentComplex(connection, 8, undefined), { statusCode: 422 });
  await assert.rejects(assertStudentComplex(connection, 7, 2), { statusCode: 422 });
});

test('legacy administrators can delegate their existing session grants but cannot gain a new grant', async () => {
  const grants = new Map([[1, ['administrators', 'grades']], [2, ['weeklySession']], [3, ['settings']]]);
  const connection = { query: async (_sql, [id]) => [(grants.get(id) || []).map(permissionKey => ({ permissionKey }))] };
  await assertAdministratorScope(connection, { role: 'admin', id: 1 }, { targetId: 2, permissions: ['weeklySession'] });
  await assert.rejects(assertAdministratorScope(connection, { role: 'admin', id: 1 }, { targetId: 3 }), { statusCode: 403 });
  await assert.rejects(assertAdministratorScope(connection, { role: 'admin', id: 1 }, { permissions: ['settings'] }), { statusCode: 403 });
});

test('bulk import preserves separate student and guardian phones and the circle complex', () => {
  const [student] = parseStudentRows([
    ['الاسم', 'جوال الطالب', 'جوال ولي الأمر', 'الحلقة', 'رقم الدخول', 'كلمة المرور'],
    ['طالب اختبار', '0500000001', '0500000002', 'حلقة اختبار', '12345', 'abc'],
  ], new Set(), [{ id: 7, name: 'حلقة اختبار', complexId: 1 }]);
  assert.equal(student.phone, '0500000001');
  assert.equal(student.guardianPhone, '0500000002');
  assert.equal(student.complexId, '1');
});

const authSource = (await readFile(new URL('../server/routes/tenantAuthRoutes.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export default router;', '');
for (const role of ['admin', 'supervisor', 'manager']) {
  test(`${role} login rejects missing/wrong passwords and grants a session only with the correct password`, async () => {
    const passwordHash = await hashStudentPassword('سر اختبار');
    for (const [password, expected] of [[undefined, 401], ['خطأ', 401], ['سر اختبار', 200]]) {
      const routes = new Map();
      let sessions = 0, failures = 0, code = 200, body;
      vm.runInNewContext(authSource, {
        express: { Router: () => ({ post: (path, handler) => routes.set(path, handler) }) },
        process: { env: {} }, trimTrailingCharacter: value => value,
        getDatabaseContext: () => ({ tenant: null }),
        db: () => ({ query: async sql => sql.includes('FROM supervisors') ? [[{ id: 7, name: 'اختبار', role, passwordHash }]] : [[]] }),
        createLoginAttemptIdentities: () => [], getLoginAttemptBlockForIdentities: async () => ({ blocked: false }),
        clearLoginFailuresForIdentities: async () => {}, recordLoginFailures: async () => { failures++; },
        verifyStudentPassword, createAuthSession: async () => { sessions++; return 'test-token'; },
        isNativeApiRequest: () => false, setSessionCookie: () => {}, TENANT_SESSION_COOKIE: 'session', AUTH_SESSION_DAYS: 1,
        DASHBOARD_PERMISSION_KEYS: [], getSupervisorDashboardPermissions: async () => ['weeklySession'],
      });
      const response = { status(value) { code = value; return this; }, json(value) { body = value; } };
      await routes.get('/login')({ body: { loginNumber: '12345', password }, protocol: 'http', ip: '127.0.0.1', get: () => 'localhost' }, response, error => { throw error; });
      assert.equal(code, expected);
      assert.equal(sessions, expected === 200 ? 1 : 0);
      assert.equal(failures, expected === 401 ? 1 : 0);
      assert.equal(Object.hasOwn(body, 'passwordHash'), false);
      assert.equal(Object.hasOwn(body, 'token'), false);
    }
  });
}

const indexSource = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
for (const [endpoint, role] of [['administrators', 'admin'], ['supervisors', 'supervisor']]) {
  test(`${endpoint} creation requires a password and stores its hash without returning it`, async () => {
    const start = indexSource.indexOf(`app.post('/api/${endpoint}'`);
    const end = indexSource.indexOf(`app.put('/api/${endpoint}/:id'`, start);
    for (const password of ['', 'اختبار']) {
      let handler, insertParams, committed = false, error;
      const connection = {
        beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release() {},
        query: async (sql, params) => { if (sql.includes('INSERT INTO supervisors')) insertParams = params; return [{ insertId: 7 }]; },
      };
      vm.runInNewContext(indexSource.slice(start, end), {
        app: { post: (_path, _permission, callback) => { handler = callback; } }, requirePermission: () => {},
        db: () => ({ getConnection: async () => connection }),
        cleanDashboardPermissions: normalizeDashboardGrants, normalizeAdministratorAccount: body => ({ ...body, permissions: [] }), assertAdministratorScope: async () => {},
        normalizeAccountName: String, normalizeAccountLoginNumber: String, normalizeOptionalNationalId: String, normalizeAccountPhone: String,
        ensureCommitteeIdsExist: async () => [], ensureLoginNumberIsAvailable: async () => {}, hashStudentPassword,
      });
      let body;
      await handler({ body: { name: 'اختبار', loginNumber: '12345', nationalId: '', phone: '', password }, auth: { role: 'manager' }, params: {} },
        { status() { return this; }, json(value) { body = value; } }, reason => { error = reason; });
      assert.equal(committed, Boolean(password));
      if (password) {
        assert.equal(error, undefined);
        assert.equal(body.role, role);
        assert.equal(Object.hasOwn(body, 'password'), false);
        assert.equal(Object.hasOwn(body, 'passwordHash'), false);
        assert.equal(await verifyStudentPassword(password, insertParams.at(-1)), true);
      } else {
        assert.equal(error.statusCode, 422);
        assert.equal(insertParams, undefined);
      }
    }
  });
}

for (const [endpoint, role] of [['administrators', 'admin'], ['supervisors', 'supervisor']]) {
  test(`${endpoint} changes hash passwords, preserve blank edits and revoke previous sessions`, async () => {
    const start = indexSource.indexOf(`app.put('/api/${endpoint}/:id'`);
    const end = indexSource.indexOf(`app.delete('/api/${endpoint}/:id'`, start);
    const source = indexSource.slice(start, end);
    for (const password of ['', 'جديد']) {
      let handler, revoked = 0, committed = false, capturedHash;
      const connection = {
        beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release() {},
        query: async (sql, params) => {
          if (sql.includes('SELECT id')) return [[{ id: 7, role, loginNumber: '12345' }]];
          if (sql.includes('SET password_hash')) capturedHash = params[0];
          return [{ affectedRows: 1 }];
        },
      };
      vm.runInNewContext(source, {
        app: { put: (_path, _permission, callback) => { handler = callback; } }, requirePermission: () => {},
        db: () => ({ getConnection: async () => connection }),
        cleanDashboardPermissions: normalizeDashboardGrants, normalizeAdministratorAccount: body => ({ ...body, permissions: [] }), assertAdministratorScope: async () => {},
        normalizeAccountName: String, normalizeAccountLoginNumber: String, normalizeOptionalNationalId: String, normalizeAccountPhone: String,
        ensureCommitteeIdsExist: async () => [], ensureLoginNumberIsAvailable: async () => {}, hashStudentPassword,
        revokeAuthSessionsForUser: async (_db, revokedRole, id) => { assert.equal(revokedRole, role); assert.equal(id, '7'); revoked++; },
      });
      await handler({ params: { id: '7' }, auth: { role: 'manager' }, body: { name: 'اختبار', loginNumber: '12345', nationalId: '', phone: '', password } }, { json() {}, status() { return this; } }, error => { throw error; });
      assert.equal(committed, true);
      assert.equal(revoked, password ? 1 : 0);
      assert.equal(capturedHash !== undefined, Boolean(password));
      if (password) assert.equal(await verifyStudentPassword(password, capturedHash), true);
    }
  });
}
