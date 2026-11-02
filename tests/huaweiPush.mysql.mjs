import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath, URL } from 'node:url';
import mysql from 'mysql2/promise';
import { hashStudentPassword } from '../server/services/studentPassword.js';
import { down } from '../server/migrations/2026.11.02.1-huawei-notification-devices.js';

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const database = `nukhab_huawei_test_${suffix}`;
const platform = `nukhab_huawei_platform_${suffix}`;
const host = process.env.MYSQL_HOST || '127.0.0.1';
assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Local isolated database only');
const config = { host, port: Number(process.env.MYSQL_PORT || 3310), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' };
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}/api`;
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, MYSQL_HOST: host, MYSQL_PORT: String(config.port), MYSQL_DATABASE: database, PLATFORM_MYSQL_DATABASE: platform,
    API_PORT: String(port), SITE_REGISTRATION_NUMBER: '990771', MANAGER_LOGIN_NUMBER: '990772', SEED_DEFAULT_DATA: 'false',
    NOTIFICATION_PUSH_CONFIG_JSON: JSON.stringify({ [database]: { huawei: { appId: '123', clientId: '456', clientSecret: 'fixture-secret' } } }) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-8000); });
let pool;
async function api(path, { method = 'GET', body, token = '', status = 200 } = {}) {
  const response = await globalThis.fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
}
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await globalThis.fetch(origin + '/health')).ok) break; } catch { /* Local startup is not yet listening. */ }
    if (attempt > 240) throw new Error(log);
    await new Promise(resolve => globalThis.setTimeout(resolve, 250));
  }
  pool = mysql.createPool({ ...config, database });
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'اختبار هواوي','97777','','','','supervisor'),(8,'حساب مستقل','97778','','','','supervisor')");
  await pool.query('UPDATE supervisors SET password_hash = ? WHERE id IN (7,8)', [await hashStudentPassword('local-huawei-test')]);
  const login = async loginNumber => (await api('/auth/login', { method: 'POST', body: { registrationNumber: '990771', loginNumber, password: 'local-huawei-test' } })).token;
  const first = await login('97777'); const second = await login('97778');
  const body = { platform: 'huawei', token: 'a'.repeat(160) };
  await api('/notifications/devices', { method: 'POST', body, status: 401 });
  await api('/notifications/push-status', { status: 401 });
  const status = await api('/notifications/push-status', { token: first });
  assert.deepEqual(status, { huawei: true, android: false, ios: false });
  await api('/notifications/devices', { method: 'POST', token: first, body: { ...body, platform: 'other' }, status: 422 });
  await api('/notifications/devices', { method: 'POST', token: first, body: { ...body, token: 'bad token' }, status: 422 });
  await api('/notifications/devices', { method: 'POST', token: first, body });
  let [[device]] = await pool.query('SELECT user_id,platform,token_hash,session_hash FROM notification_devices');
  assert.equal(device.platform, 'huawei'); assert.equal(Number(device.user_id), 7);
  await assert.rejects(down(pool), /retained/);
  await api('/notifications/devices', { method: 'DELETE', token: second, body });
  const [[retained]] = await pool.query('SELECT COUNT(*) AS total FROM notification_devices'); assert.equal(Number(retained.total), 1);
  await api('/notifications/devices', { method: 'POST', token: first, body: { ...body, platform: 'android' } });
  const [devices] = await pool.query('SELECT token_hash FROM notification_devices');
  assert.equal(new Set(devices.map(row => row.token_hash)).size, 2, 'HMS and FCM token namespaces stay distinct');
  await api('/notifications/devices', { method: 'DELETE', token: first, body });
  const [[remaining]] = await pool.query("SELECT COUNT(*) AS total FROM notification_devices WHERE platform='huawei'"); assert.equal(Number(remaining.total), 0);
  console.log(JSON.stringify({ passed: true, checks: ['real MySQL migration', 'authenticated status', 'unauthenticated denial', 'invalid input', 'HMS registration', 'cross-account deletion denied', 'separate provider identity', 'safe rollback', 'unregister'] }));
} finally {
  server.kill(); if (server.exitCode === null) await once(server, 'exit');
  if (pool) await pool.end();
  const cleanup = await mysql.createConnection(config);
  for (const name of [database, platform]) {
    assert.match(name, /^nukhab_huawei_(test|platform)_[a-f0-9]{12}$/);
    await cleanup.query(`DROP DATABASE IF EXISTS \`${name}\``);
  }
  await cleanup.end();
}
