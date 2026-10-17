import assert from 'node:assert/strict';
import console from 'node:console';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false', 'This preparation test must not start media recording or paid analysis.');
assert.ok(config.CALL_ARCHIVE_DEMO_PASSWORD, 'The private demo password is required.');
const base = 'http://127.0.0.1:3037/api';
const request = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const response = await globalThis.fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-nukhab-native': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: globalThis.AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
};
const login = (number, password = config.CALL_ARCHIVE_DEMO_PASSWORD) => request('/auth/login', { method: 'POST', body: { loginNumber: number, password } });
assert.equal((await request('/calls?registrationNumber=100001')).status, 403);
assert.equal((await request('/calls', { headers: { 'x-registration-number': '100001' } })).status, 403);
assert.equal((await request('/auth/login', { method: 'POST', body: { registrationNumber: '100001', loginNumber: '990002', password: config.CALL_ARCHIVE_DEMO_PASSWORD } })).status, 403);
assert.equal((await request('/calls')).status, 401);
assert.equal((await login('990003', `${config.CALL_ARCHIVE_DEMO_PASSWORD}-wrong`)).status, 401);
for (const [number, role] of [['990002', 'reciter'], ['990003', 'student']]) {
  const signedIn = await login(number);
  assert.equal(signedIn.status, 200, `${role} login failed`);
  assert.equal(signedIn.body.role, role);
  const token = signedIn.body.token;
  assert.ok(typeof token === 'string' && token.length > 0);
  assert.equal((await request('/calls', { token })).status, 200);
  for (const path of ['/settings', '/reciters', '/administrators']) assert.equal((await request(path, { token })).status, 403, `${role} ${path}`);
  if (role === 'reciter') {
    assert.deepEqual((await request('/dashboard-permissions/me', { token })).body.permissions, ['calls']);
    assert.equal((await request('/students', { token })).status, 403);
    assert.equal((await request('/reports/overview', { token })).status, 403);
  }
  assert.equal((await request('/auth/logout', { method: 'POST', token, body: {} })).status, 200);
  assert.equal((await request('/calls', { token })).status, 401);
}
console.log('Real local API authentication passed: hashed student/reciter logins, wrong-password denial, unauthenticated denial, calls-only scope, settings/account-management denial and logout revocation. Recording and AI remained disabled; no media provider was substituted or contacted.');
