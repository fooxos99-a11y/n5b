import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import process from 'node:process';
import console from 'node:console';
import { createPassingGuestFixture } from './helpers/passingGuestFixture.mjs';
import { createAuthSession } from '../server/services/authSessions.js';

const database = `nukhab_guest_test_${randomBytes(8).toString('hex')}`;
const { pool, app, linkToken, staffTokens, runWithDatabase } = await createPassingGuestFixture(database);
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
let checks = 0;
const call = async (path, { token, guest, link, body, method = body === undefined ? 'GET' : 'PUT' } = {}) => {
  const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Cookie: `nukhab_session=${token}` } : {}),
    ...(guest ? { 'X-Passing-Session': guest } : {}), ...(link ? { 'X-Passing-Link': link } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const status = (response, expected) => { checks++; assert.equal(response.status, expected, JSON.stringify(response)); return response.body; };
try {
  await pool.query("UPDATE students SET password_hash='fixture-only-hash',points=1250.75,store_balance=30 WHERE id=11");
  await pool.query("UPDATE students SET password_hash='fixture-only-hash',points=25,store_balance=20 WHERE id=12");
  await pool.query("INSERT INTO student_point_transactions(student_id,transaction_type,points,reason,transaction_date) VALUES(11,'increase',1250.75,'local fixture',CURRENT_DATE()),(12,'increase',25,'local fixture',CURRENT_DATE())");
  const tokens = await runWithDatabase(database, {}, async () => ({ a: await createAuthSession('student', 11, 'طالب محلي'), b: await createAuthSession('student', 12, 'طالب آخر') }));
  status(await call('/summit'), 401);
  status(await call('/summit', { token: staffTokens.manager }), 403);
  status(await call('/summit/settings', { token: tokens.a }), 403);
  status(await call('/summit/settings', { token: staffTokens.admin }), 403);
  status(await call('/summit/settings', { token: staffTokens.otherAdmin }), 200);
  const guest = status(await call('/passing/guest/session', { method: 'POST', link: linkToken, body: { name: 'مقرئ محلي' } }), 201).token;
  for (const path of ['/summit', '/summit/settings', '/summit/stations/local/grades']) status(await call(path, { guest, token: staffTokens.manager }), 403);
  const journey = status(await call('/summit?studentId=12', { token: tokens.a }), 200);
  assert.equal(journey.points, 1250); assert.equal(journey.totalKilometers, 8000); assert.equal(journey.nextStage.name, 'المذنب');
  status(await call('/summit/progress', { token: tokens.a, body: { kilometers: 1251, studentId: 12 } }), 403);
  status(await call('/summit/progress', { token: tokens.a, body: { kilometers: -1 } }), 422);
  status(await call('/summit/progress', { token: tokens.a, body: { kilometers: 500, studentId: 12 } }), 200);
  assert.equal(status(await call('/summit', { token: tokens.a }), 200).displayedKilometers, 500);
  assert.equal(status(await call('/summit', { token: tokens.b }), 200).displayedKilometers, 0);
  status(await call('/summit/arrivals/mithnab', { token: tokens.a, body: {}, method: 'POST' }), 403);
  status(await call('/summit/arrivals/unaizah', { token: tokens.a, body: {}, method: 'POST' }), 200);
  status(await call('/summit/arrivals/unaizah', { token: tokens.a, body: {}, method: 'POST' }), 200);
  const [[arrivals]] = await pool.query('SELECT COUNT(*) AS n FROM student_summit_arrivals WHERE student_id=11'); assert.equal(arrivals.n, 1);
  assert.equal(status(await call('/summit', { token: tokens.b }), 200).stages.find(stage => stage.id === 'unaizah').completed, false);
  let settings = status(await call('/summit/settings', { token: staffTokens.manager }), 200);
  const invalid = globalThis.structuredClone(settings); invalid.mapConfig.cities[0].image = 'https://example.test/photo.jpg';
  status(await call('/summit/settings', { token: staffTokens.manager, body: invalid }), 422);
  const station = { id: 'local-station', name: 'محطة محلية', kilometer: 1500, rewardPoints: 100, notificationEnabled: false, notificationText: 'وصلت إلى المحطة' };
  settings.mapConfig.stations = [station]; settings.mapConfig.activeStationId = station.id;
  settings.mapConfig.cities[1].notificationEnabled = true;
  const stale = globalThis.structuredClone(settings);
  settings = status(await call('/summit/settings', { token: staffTokens.manager, body: settings }), 200);
  status(await call('/summit/settings', { token: staffTokens.otherAdmin, body: stale }), 409);
  const activeJourney = status(await call('/summit', { token: tokens.b }), 200);
  assert.equal(activeJourney.activeStation.id, station.id);
  status(await call(`/summit/arrivals/${station.id}`, { token: tokens.b, body: {}, method: 'POST' }), 200);
  const grades = (token, rows) => call(`/summit/stations/${station.id}/grades`, { token, body: { grades: rows } });
  status(await grades(tokens.a, [{ studentId: 11, points: 10 }]), 403);
  status(await grades(staffTokens.admin, [{ studentId: 11, points: 10 }]), 403);
  status(await grades(staffTokens.manager, [{ studentId: 11, points: 101 }]), 422);
  status(await grades(staffTokens.manager, [{ studentId: 11, points: 10 }, { studentId: 11, points: 20 }]), 422);
  status(await grades(staffTokens.manager, [{ studentId: 11, points: 10 }, { studentId: 99999, points: 20 }]), 404);
  let [[balance]] = await pool.query('SELECT points,store_balance AS wallet FROM students WHERE id=11'); assert.equal(Number(balance.points), 1250.75);
  const first = status(await grades(staffTokens.manager, [{ studentId: 11, points: 75 }]), 200); assert.equal(first.grades[0].awardedPoints, 75);
  for (const response of await Promise.all([grades(staffTokens.manager, [{ studentId: 11, points: 75 }]), grades(staffTokens.manager, [{ studentId: 11, points: 75 }])])) {
    assert.equal(status(response, 200).grades[0].awardedPoints, 0);
  }
  const corrected = status(await grades(staffTokens.manager, [{ studentId: 11, points: 50 }]), 200); assert.equal(corrected.grades[0].awardedPoints, -25);
  [[balance]] = await pool.query('SELECT points,store_balance AS wallet FROM students WHERE id=11'); assert.equal(Number(balance.points), 1300.75); assert.equal(Number(balance.wallet), 80);
  const [[ledger]] = await pool.query("SELECT COUNT(*) AS n,SUM(CASE WHEN transaction_type='increase' THEN points ELSE -points END) AS total FROM student_point_transactions WHERE student_id=11 AND source_type='summit_station'");
  assert.equal(ledger.n, 2); assert.equal(Number(ledger.total), 50);
  await pool.query('UPDATE students SET store_balance=0 WHERE id=11');
  assert.equal(status(await call('/summit', { token: tokens.a }), 200).points, 1300);
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(4,'settings')");
  const roster = status(await call(`/summit/stations/${station.id}/grades`, { token: staffTokens.supervisor }), 200);
  assert.deepEqual(roster.students.map(student => student.id), [11]);
  status(await grades(staffTokens.supervisor, [{ studentId: 11, points: 60 }, { studentId: 12, points: 10 }]), 403);
  [[balance]] = await pool.query('SELECT points FROM students WHERE id=11'); assert.equal(Number(balance.points), 1300.75);
  settings.mapConfig.activeStationId = null;
  settings = status(await call('/summit/settings', { token: staffTokens.manager, body: settings }), 200);
  status(await grades(staffTokens.manager, [{ studentId: 11, points: 50 }]), 422);
  status(await call('/summit/arrivals/local-station', { token: tokens.b, body: {}, method: 'POST' }), 404);
  settings.enabled = false;
  settings = status(await call('/summit/settings', { token: staffTokens.manager, body: settings }), 200);
  assert.deepEqual(status(await call('/summit', { token: tokens.a }), 200), { enabled: false });
  status(await call('/summit/progress', { token: tokens.a, body: { kilometers: 1 } }), 404);
  status(await call('/summit/arrivals/unaizah', { token: tokens.a, body: {}, method: 'POST' }), 404);
  const { up } = await import('../server/migrations/2026.10.21.2-student-map.js');
  await up(pool);
  assert.deepEqual(status(await call('/summit/settings', { token: staffTokens.manager }), 200), settings, 'rerunning the migration preserves map settings');
  const { resetAllProgramPoints } = await import('../server/index.js');
  await runWithDatabase(database, {}, async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await resetAllProgramPoints(connection);
      for (const table of ['student_summit_progress', 'student_summit_arrivals', 'student_station_points']) {
        const [[count]] = await connection.query(`SELECT COUNT(*) AS n FROM ${table}`); assert.equal(count.n, 0);
      }
      const [[student]] = await connection.query('SELECT points FROM students WHERE id=11'); assert.equal(Number(student.points), 0);
      const [[config]] = await connection.query('SELECT setting_value AS value FROM app_settings WHERE setting_key=?', ['summitMapSettings']);
      assert.deepEqual(JSON.parse(config.value), settings);
    } finally { await connection.rollback(); connection.release(); }
  });
  console.log(`Summit map real API/MySQL: ${checks} checks passed; own ranking balance, guest denial, settings revision, station idempotence, corrections, scope, atomic rollback and disabled feature verified.`);
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_guest_test_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE \`${database}\``); } finally { await connection.end(); }
}
