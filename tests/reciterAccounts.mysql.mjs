import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { URL } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import tenantAuthRouter from '../server/routes/tenantAuthRoutes.js';
import { createAuthenticateApiRequest } from '../server/services/authSessions.js';
import { hashStudentPassword } from '../server/services/studentPassword.js';
import { getSupervisorDashboardPermissions } from '../server/services/dashboardPermissions.js';
import { buildGradingOverview, buildGradingSessionReport } from '../server/services/gradingReports.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

assert.ok(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
assert.notEqual(Number(process.env.MYSQL_PORT), 3312, 'protected database must never be used');
register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { authorizeApiRequest, reciterRouter, app: dashboardApp } = await import('../server/index.js');
const database = `nukhab_reciters_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server, mediaServer, rejectDisconnect = false;
const removedParticipants = [];
const savedMediaEnvironment = Object.fromEntries(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].map(key => [key, process.env[key]]));
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const password = 'local-test-password';
  const hash = await hashStudentPassword(password);
  await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title,role,password_hash) VALUES (1,'Test manager','100001','','','','manager',?)", [hash]);
  await pool.query("INSERT INTO committees (id,name) VALUES (1,'Test one'),(2,'Test two')");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => runWithDatabase(database, { tenant: { registrationNumber: '100001', name: 'Test' } }, next));
  app.use(createAuthenticateApiRequest({ isPublicApiRequest: req => req.method === 'POST' && req.path === '/auth/login' }));
  app.use(authorizeApiRequest);
  app.use('/auth', tenantAuthRouter);
  app.use('/reciters', reciterRouter);
  for (const [method, path] of [['post', '/administrators'], ['delete', '/administrators/:id'], ['get', '/students'],
    ['get', '/student-plans/preferences'], ['get', '/quran/chapters'], ['get', '/narration-events'], ['get', '/reports/overview']]) {
    const route = dashboardApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods[method]).route;
    app[method](path, ...route.stack.map(item => item.handle));
  }
  app.get('/dashboard-permissions/me', async (req, res) => res.json({ permissions: await getSupervisorDashboardPermissions(req.auth.id) }));
  app.get('/calls', (_req, res) => res.json({ allowed: true }));
  app.get('/reports/overview', (_req, res) => res.json({ explicitlyGranted: true }));
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
  const login = loginNumber => request('/auth/login', { method: 'POST', body: { loginNumber, password } });
  const manager = await login('100001');
  assert.equal(manager.status, 200);
  const managerToken = manager.body.token;
  const payload = { name: 'مقرئ اختبار', loginNumber: '200001', password, committeeIds: ['1'], permissions: [] };
  assert.equal((await request('/reciters', { method: 'POST', body: payload })).status, 401);
  assert.equal((await request('/reciters', { method: 'POST', token: managerToken, body: { ...payload, loginNumber: 'invalid' } })).status, 422);
  assert.equal((await request('/reciters', { method: 'POST', token: managerToken, body: { ...payload, committeeIds: ['999'] } })).status, 422);
  const created = await request('/reciters', { method: 'POST', token: managerToken, body: payload });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  const media = express();
  media.use(express.json());
  media.post('/twirp/livekit.RoomService/RemoveParticipant', (req, res) => {
    if (rejectDisconnect) return res.status(503).json({ code: 'unavailable', msg: 'Local test unavailable' });
    removedParticipants.push(req.body);
    res.json({});
  });
  mediaServer = await new Promise(resolve => { const listener = media.listen(0, '127.0.0.1', () => resolve(listener)); });
  Object.assign(process.env, { LIVEKIT_URL: `http://127.0.0.1:${mediaServer.address().port}`, LIVEKIT_API_KEY: 'local-key', LIVEKIT_API_SECRET: 'local-test-secret-with-at-least-32-characters' });
  const mediaRoom = `local-reciters-${randomUUID()}`;
  const [room] = await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES ('Local room',?,1,'reciter',?,'Test')", [mediaRoom, id]);
  await pool.query("INSERT INTO call_room_participants(room_id,user_role,user_id,user_name) VALUES (?,'reciter',?,'Test')", [room.insertId, id]);
  assert.equal((await request('/reciters', { method: 'POST', token: managerToken, body: payload })).status, 409);
  const wrong = await request('/auth/login', { method: 'POST', body: { loginNumber: payload.loginNumber, password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  const signedIn = await login(payload.loginNumber);
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.role, 'reciter');
  assert.deepEqual(signedIn.body.dashboardPermissions, ['calls']);
  let token = signedIn.body.token;
  assert.equal((await request('/calls', { token })).status, 200);
  for (const path of ['/students', '/students/3', '/student-plans', '/reports/overview', '/settings', '/reciters', '/administrators',
    '/supervisors/1/quran-evaluation', '/offline-recitation/bootstrap', '/recitation-preferences', '/staff-attendance', '/notifications', '/dashboard-permissions']) {
    assert.equal((await request(path, { token })).status, 403, path);
    assert.equal((await request(path, { method: 'POST', token, body: {} })).status, 403, `POST ${path}`);
  }
  assert.equal((await request(`/reciters/${id}`, { method: 'PUT', token, body: { ...payload, permissions: ['settings'] } })).status, 403);
  assert.equal((await request(`/reciters/${id}`, { method: 'PUT', token: managerToken, body: { ...payload, password: '', permissions: ['reports'] } })).status, 200);
  assert.equal((await request('/calls', { token })).status, 401, 'scope updates revoke the earlier login');
  token = (await login(payload.loginNumber)).body.token;
  assert.equal((await request('/reports/overview', { token })).status, 200);
  assert.equal((await request('/settings', { token })).status, 403);
  rejectDisconnect = true;
  assert.equal((await request(`/reciters/${id}/active`, { method: 'PUT', token: managerToken, body: { isActive: false } })).status, 503);
  assert.equal((await request('/calls', { token })).status, 200, 'failed media revocation rolls back account/session changes');
  rejectDisconnect = false;
  assert.equal((await request(`/reciters/${id}/active`, { method: 'PUT', token: managerToken, body: { isActive: false } })).status, 200);
  assert.ok(removedParticipants.some(item => item.room === mediaRoom && item.identity === `reciter:${id}`));
  assert.equal((await request('/calls', { token })).status, 401);
  assert.equal((await login(payload.loginNumber)).status, 401);
  assert.equal((await request(`/reciters/${id}/active`, { method: 'PUT', token: managerToken, body: { isActive: true } })).status, 200);
  assert.equal((await request(`/reciters/${id}`, { method: 'PUT', token: managerToken, body: { ...payload, password: '', permissions: [] } })).status, 200);
  token = (await login(payload.loginNumber)).body.token;
  assert.equal((await request('/reports/overview', { token })).status, 403);
  assert.equal((await request(`/reciters/${id}`, { method: 'PUT', token: managerToken, body: { ...payload, password: '', permissions: ['reciters', 'administrators', 'reports', 'students', 'studentPlans', 'narrationDay'] } })).status, 200);
  token = (await login(payload.loginNumber)).body.token;
  for (const path of ['/students', '/student-plans/preferences', '/quran/chapters', '/narration-events', '/reports/overview']) {
    const granted = await request(path, { token });
    assert.equal(granted.status, 200, `${path}: ${JSON.stringify(granted.body)}`);
  }
  assert.equal((await request('/settings', { token })).status, 403);
  const child = { ...payload, name: 'Delegated child', loginNumber: '200002', permissions: ['reports'] };
  assert.equal((await request('/reciters', { method: 'POST', token, body: { ...child, permissions: ['settings'] } })).status, 403);
  assert.equal((await request(`/reciters/${id}`, { method: 'PUT', token, body: { ...payload, password: '', permissions: ['reciters', 'settings'] } })).status, 403);
  const delegatedChild = await request('/reciters', { method: 'POST', token, body: child });
  assert.equal(delegatedChild.status, 201);
  assert.equal((await request(`/reciters/${delegatedChild.body.id}`, { method: 'PUT', token, body: { ...child, password: '', permissions: ['settings'] } })).status, 403);
  assert.equal((await request(`/reciters/${delegatedChild.body.id}`, { method: 'DELETE', token })).status, 200);
  const adminChild = await request('/administrators', { method: 'POST', token, body: { ...child, loginNumber: '200003' } });
  assert.equal(adminChild.status, 201, JSON.stringify(adminChild.body));
  assert.equal((await request('/administrators', { method: 'POST', token, body: { ...child, loginNumber: '200004', permissions: ['settings'] } })).status, 403);
  assert.equal((await request(`/administrators/${adminChild.body.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal((await request('/auth/logout', { method: 'POST', token, body: {} })).status, 200);
  assert.equal((await request('/calls', { token })).status, 401);
  const finalLogin = await login(payload.loginNumber);
  assert.equal((await request(`/reciters/${id}`, { method: 'DELETE', token: managerToken })).status, 200);
  assert.equal((await request('/calls', { token: finalLogin.body.token })).status, 401);

  const policy = normalizeGradingPolicy({ trackSession: { sessionDay: 3 }, weeklySession: { sessionDay: 3 } });
  await pool.query("INSERT INTO app_settings (setting_key,setting_value) VALUES ('gradingPolicy',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [JSON.stringify(policy)]);
  await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES (3,'Test three','300003','','',1,'2026-01-01'),(4,'Test four','300004','','',2,'2026-01-01')");
  for (const [studentId, component, day, grade] of [[3, 'track', 2, 9], [4, 'track', 3, 11], [3, 'weekly', 3, 20]]) {
    const section = component === 'track' ? 'trackSession' : 'weeklySession';
    const snapshot = { ...policy, [section]: { ...policy[section], sessionDay: day } };
    await pool.query("INSERT INTO student_weekly_components(student_id,week_start,component,attended,grade,max_grade,detail_json,policy_json) VALUES (?,'2026-09-20',?,1,?,?,?,?)", [studentId, component, grade, component === 'track' ? 30 : 20, '{}', JSON.stringify(snapshot)]);
  }
  await runWithDatabase(database, {}, async () => {
    const scope = createOverviewReportScope(pool);
    const tuesday = await buildGradingOverview(scope, { from: '2026-09-22', to: '2026-09-22' });
    const wednesday = await buildGradingOverview(scope, { from: '2026-09-23', to: '2026-09-23' });
    assert.equal(tuesday.trackSession.grade, 9);
    assert.equal(tuesday.weeklySession.grade, 0);
    assert.equal(wednesday.trackSession.grade, 11);
    assert.equal(wednesday.weeklySession.grade, 20);
    assert.equal(wednesday.trackSession.expectedAttendance, 1, 'Tuesday session is not expected twice');
    const emptyDay = await buildGradingOverview(scope, { from: '2026-09-24', to: '2026-09-24' });
    assert.equal(emptyDay.trackSession.grade, 0);
    assert.equal(emptyDay.trackSession.max, 0);
    const circleOne = await buildGradingOverview(createOverviewReportScope(pool, { committeeId: '1' }), { from: '2026-09-23', to: '2026-09-23' });
    assert.equal(circleOne.trackSession.grade, 0);
    assert.equal(circleOne.weeklySession.grade, 20);
    const assertUnavailableDay = async label => {
      const overview = await buildGradingOverview(scope, { from: '2026-09-23', to: '2026-09-23' });
      for (const component of ['trackSession', 'weeklySession']) {
        assert.equal(overview[component].grade, 0, `${label}: numerator`);
        assert.equal(overview[component].max, 0, `${label}: denominator`);
      }
      const report = await buildGradingSessionReport(pool, { component: 'track', from: '2026-09-23', to: '2026-09-23' });
      assert.ok(report.rows.every(row => row.grade === 0 && row.max === 0), label);
    };
    await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES ('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [JSON.stringify([{ startDate: '2026-09-23', endDate: '2026-09-23' }])]);
    await assertUnavailableDay('holiday added after the session');
    await pool.query("UPDATE app_settings SET setting_value='[]' WHERE setting_key='seasonalHolidays'");
    const pause = JSON.stringify({ revision: 1, periods: [{ startDate: '2026-09-23', endDate: '2026-09-23' }] });
    await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES ('studentPlanPause',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [pause]);
    await assertUnavailableDay('global pause added after the session');
    await pool.query("DELETE FROM app_settings WHERE setting_key='studentPlanPause'");
    await pool.query('INSERT INTO student_plan_pauses(student_id,state_json) VALUES (4,?)', [pause]);
    const pausedIndividual = await buildGradingOverview(scope, { from: '2026-09-23', to: '2026-09-23' });
    assert.equal(pausedIndividual.trackSession.grade, 0);
    assert.equal(pausedIndividual.trackSession.max, 0);
    assert.equal(pausedIndividual.weeklySession.grade, 20, 'another student is unaffected');
    const individualReport = await buildGradingSessionReport(pool, { component: 'track', from: '2026-09-23', to: '2026-09-23' });
    assert.equal(individualReport.rows.find(row => row.id === 4).grade, 0);
    assert.equal(individualReport.rows.find(row => row.id === 4).max, 0);
  });
  console.log('Reciter MySQL passed: real password login success/failure, calls-only API denials, explicit grant and revocation, disabled/deleted/logout sessions, account CRUD validation; daily SQL excludes other scheduled days and honors circle scope.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (mediaServer) await new Promise(resolve => mediaServer.close(resolve));
  for (const [key, value] of Object.entries(savedMediaEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_reciters_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
