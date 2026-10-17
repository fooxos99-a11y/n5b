import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { URL } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { applyLocalCallEnvironment, readLocalCallEnvironment, LOCAL_CALL_DATABASE } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.MYSQL_DATABASE, LOCAL_CALL_DATABASE);
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
applyLocalCallEnvironment(config);
register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { initDatabase, runWithDatabase } = await import('../server/db.js');
const { createAuthenticateApiRequest } = await import('../server/services/authSessions.js');
const { hashStudentPassword } = await import('../server/services/studentPassword.js');
const { default: authRouter } = await import('../server/routes/tenantAuthRoutes.js');
const { authorizeApiRequest, teacherRouter, app: dashboardApp } = await import('../server/index.js');
const database = `nukhab_teachers_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const password = 'local-teacher-fixture-password';
  const hash = await hashStudentPassword(password);
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'حلقة المعلم الأولى'),(2,'حلقة محجوبة')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role,password_hash) VALUES(1,'مدير الاختبار','100001','','','','manager',?),(2,'إداري مفوض','100002','','','','admin',?),(3,'مقرئ الاختبار','100003','','','','reciter',?)", [hash, hash, hash]);
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,password_hash) VALUES(1,'طالب المعلم','200001','','',1,?),(2,'طالب حلقة أخرى','200002','','',2,?)", [hash, hash]);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => runWithDatabase(database, { tenant: { registrationNumber: '100001', name: 'Teacher test' } }, next));
  app.use(createAuthenticateApiRequest({ isPublicApiRequest: req => req.method === 'POST' && req.path === '/auth/login' }));
  app.use(authorizeApiRequest);
  app.use('/auth', authRouter);
  app.use('/teachers', teacherRouter);
  for (const path of ['/dashboard-bootstrap', '/dashboard-permissions/me', '/reports/overview', '/reports/committees', '/reports/grading-sessions']) {
    const route = dashboardApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods.get).route;
    app.get(path, ...route.stack.map(item => item.handle));
  }
  app.use((_req, res) => res.json({ unexpectedAccess: true }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(error.code === 'ER_DUP_ENTRY' ? 409 : error.statusCode || error.status || 500).json({ message: error.message });
  });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const request = async (path, { method = 'GET', token, body } = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-nukhab-native': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const login = (loginNumber, secret = password) => request('/auth/login', { method: 'POST', body: { loginNumber, password: secret } });
  const manager = await login('100001');
  assert.equal(manager.status, 200);
  const managerToken = manager.body.token;
  const payload = { name: 'معلم الاختبار', loginNumber: '300001', password, nationalId: '', phone: '', committeeIds: ['1'], permissions: [] };
  const create = body => request('/teachers', { method: 'POST', token: managerToken, body });
  for (const committeeIds of [[], ['1', '2'], ['999999']]) assert.equal((await create({ ...payload, committeeIds })).status, 422);
  assert.equal((await create({ ...payload, permissions: ['settings'] })).status, 422);
  assert.equal((await create({ ...payload, loginNumber: '200001' })).status, 409);
  const created = await create(payload);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.role, 'teacher');
  assert.deepEqual(created.body.committeeIds, ['1']);
  assert.equal((await create(payload)).status, 409);
  assert.equal((await request('/teachers/1', { method: 'DELETE', token: managerToken })).status, 404);
  assert.equal((await request('/teachers/1', { method: 'PUT', token: managerToken, body: payload })).status, 404);
  assert.equal((await login('300001', 'incorrect-local-password')).status, 401);
  let teacher = await login('300001');
  assert.equal(teacher.status, 200);
  assert.equal(teacher.body.role, 'teacher');
  assert.deepEqual(teacher.body.dashboardPermissions, ['reports']);
  let token = teacher.body.token;
  assert.deepEqual((await request('/dashboard-bootstrap', { token })).body.permissions, ['reports']);
  const overviewPath = '/reports/overview?from=2026-10-18&to=2026-10-18';
  let report = await request(overviewPath, { token });
  assert.equal(report.status, 200);
  assert.equal(report.body.totals.studentsCount, 1);
  assert.match(JSON.stringify(report.body), /طالب المعلم/);
  assert.doesNotMatch(JSON.stringify(report.body), /طالب حلقة أخرى|حلقة محجوبة/);
  assert.deepEqual((await request('/reports/committees', { token })).body.map(row => row.id), [1]);
  report = await request(`${overviewPath}&committeeId=2&role=manager&supervisorId=1`, { token });
  assert.equal(report.status, 200);
  assert.equal(report.body.totals.studentsCount, 0);
  assert.doesNotMatch(JSON.stringify(report.body), /طالب حلقة أخرى/);
  assert.equal((await request('/reports/overview?from=invalid', { token })).status, 422);
  for (const path of ['/students', '/settings', '/reports/archives', '/reports/supervisors', '/reports/teacher-points', '/reciters', '/teachers', '/calls', '/notifications', '/offline-recitation/bootstrap']) {
    assert.equal((await request(path, { token })).status, 403, path);
  }
  assert.equal((await request('/teachers', { method: 'POST', token, body: payload })).status, 403);
  assert.equal((await request('/students/1/attendance', { method: 'POST', token, body: {} })).status, 403);
  assert.equal((await request('/reports/overview', { method: 'PUT', token, body: {} })).status, 403);
  for (const loginNumber of ['200001', '100003']) {
    const denied = await login(loginNumber);
    assert.equal((await request('/teachers', { method: 'POST', token: denied.body.token, body: payload })).status, 403);
  }
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(2,'teachers')");
  const delegated = await login('100002');
  assert.equal((await request('/teachers', { method: 'POST', token: delegated.body.token, body: { ...payload, loginNumber: '300002' } })).status, 403);
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(2,'reports')");
  assert.equal((await request('/teachers', { method: 'POST', token: delegated.body.token, body: { ...payload, loginNumber: '300002' } })).status, 201);
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(?,'settings'),(?,'teachers')", [id, id]);
  assert.deepEqual((await request('/dashboard-permissions/me', { token })).body.permissions, ['reports']);
  assert.equal((await request('/settings', { token })).status, 403);
  await pool.query('DELETE FROM supervisor_committees WHERE supervisor_id=?', [id]);
  assert.equal((await request(overviewPath, { token })).body.totals.studentsCount, 0);
  const update = body => request(`/teachers/${id}`, { method: 'PUT', token: managerToken, body });
  assert.equal((await update({ ...payload, password: '', committeeIds: ['2'] })).status, 200);
  assert.equal((await request(overviewPath, { token })).status, 401);
  teacher = await login('300001'); token = teacher.body.token;
  report = await request(overviewPath, { token });
  assert.match(JSON.stringify(report.body), /طالب حلقة أخرى/);
  assert.doesNotMatch(JSON.stringify(report.body), /طالب المعلم/);
  assert.equal((await update({ ...payload, committeeIds: ['2'], password: `${password}-new` })).status, 200);
  assert.equal((await request(overviewPath, { token })).status, 401);
  assert.equal((await login('300001')).status, 401);
  teacher = await login('300001', `${password}-new`); token = teacher.body.token;
  assert.equal(teacher.status, 200);
  assert.equal((await request(`/teachers/${id}/active`, { method: 'PUT', token: managerToken, body: { isActive: false } })).status, 200);
  assert.equal((await request(overviewPath, { token })).status, 401);
  assert.equal((await login('300001', `${password}-new`)).status, 401);
  assert.equal((await request(`/teachers/${id}/active`, { method: 'PUT', token: managerToken, body: { isActive: true } })).status, 200);
  teacher = await login('300001', `${password}-new`); token = teacher.body.token;
  assert.equal((await request('/auth/logout', { method: 'POST', token })).status, 200);
  assert.equal((await request(overviewPath, { token })).status, 401);
  teacher = await login('300001', `${password}-new`); token = teacher.body.token;
  assert.equal((await request(`/teachers/${id}`, { method: 'DELETE', token: managerToken })).status, 200);
  assert.equal((await request(overviewPath, { token })).status, 401);
  assert.equal((await login('300001', `${password}-new`)).status, 401);
  assert.equal((await request('/dashboard-bootstrap', { token: managerToken })).status, 200);
  console.log('Teacher MySQL passed: actual login, account CRUD, one-circle validation, scoped indicators, cross-circle denial, immutable read-only permissions, delegated grant checks, reassignment/password/disable/delete/logout revocation.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool?.end();
  const connection = await mysql.createConnection({ host: config.MYSQL_HOST, port: Number(config.MYSQL_PORT), user: config.MYSQL_USER, password: config.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_teachers_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
