import assert from 'node:assert/strict';
import console from 'node:console';
import { readdir } from 'node:fs/promises';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
const base = 'http://127.0.0.1:3037/api';
const session = 'c5fb40ca-5d5a-4b0b-af34-9371ba7d8231';
const tokens = [];
const request = (route, { token, method = 'GET', body, headers = {} } = {}) => globalThis.fetch(`${base}${route}`, {
  method, headers: { 'Content-Type': 'application/json', 'x-nukhab-native': '1', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: globalThis.AbortSignal.timeout(10000), redirect: 'error',
});
const login = async number => {
  const response = await request('/auth/login', { method: 'POST', body: { loginNumber: number, password: config.CALL_ARCHIVE_DEMO_PASSWORD } });
  assert.equal(response.status, 200);
  const { token } = await response.json(); tokens.push(token); return token;
};
try {
  const backup = (await readdir('backups/call-archive-local')).find(name => name.endsWith('.sql'));
  assert.ok(backup);
  for (const port of [3038, 3039]) for (const file of ['.env.call-archive.local', `backups/call-archive-local/${encodeURIComponent(backup)}`]) {
    const denied = await globalThis.fetch(`http://127.0.0.1:${port}/${file}`, { method: 'HEAD', signal: globalThis.AbortSignal.timeout(10000) });
    assert.equal(denied.status, 403, 'Private configuration and SQL backups must not be served by either preview.');
  }
  const manager = await login('990001');
  const rows = await (await request('/reciters', { token: manager })).json();
  const existing = rows.find(row => row.loginNumber === '990004');
  if (existing) assert.equal(existing.name, 'مقرئ إضافي — معاينة محلية');
  else {
    const created = await request('/reciters', { token: manager, method: 'POST', body: {
      name: 'مقرئ إضافي — معاينة محلية', loginNumber: '990004', password: config.CALL_ARCHIVE_DEMO_PASSWORD, permissions: [], committeeIds: [],
    } });
    assert.equal(created.status, 201, 'Manager must be able to create a local preview reciter.');
  }
  const student = await login('990003');
  assert.equal((await request('/reciters', { token: student, method: 'POST', body: {} })).status, 403);
  assert.equal((await request(`/calls/archive/sessions/${session}/review`, { token: student, method: 'PUT', body: { notes: '', approvedErrors: [] } })).status, 403);
  for (const number of ['990003', '990002', '990005']) {
    const token = await login(number);
    for (const path of ['/calls/archive', '/calls/archive/rooms/2', `/calls/archive/sessions/${session}`]) {
      assert.equal((await request(path, { token })).status, 403, `${number} cannot read archives`);
    }
    const calls = await request('/calls', { token });
    if (number !== '990005') {
      assert.equal(calls.status, 200);
      assert.equal((await calls.json()).canAccessArchive, false);
    }
  }
  const managerCalls = await request('/calls', { token: manager });
  assert.equal((await managerCalls.json()).canAccessArchive, true);
  const detailsResponse = await request(`/calls/archive/sessions/${session}`, { token: manager });
  assert.equal(detailsResponse.status, 200);
  const details = await detailsResponse.json();
  assert.equal(details.canReview, true);
  assert.equal(details.media.length, 3);
  assert.ok(details.report.summary.includes('نموذج محلي'));
  const mixed = details.media.find(item => item.kind === 'mixed');
  for (const number of ['990003', '990002', '990005']) {
    const token = await login(number);
    assert.equal((await request(`/calls/archive/sessions/${session}/media/${mixed.id}/playback`, { token, method: 'POST', body: {} })).status, 403);
  }
  const grantResponse = await request(`/calls/archive/sessions/${session}/media/${mixed.id}/playback`, { token: manager, method: 'POST', body: {} });
  assert.equal(grantResponse.status, 200);
  const grant = await grantResponse.json();
  const range = await globalThis.fetch(`http://127.0.0.1:3037${grant.url}`, { headers: { Range: 'bytes=0-63' }, signal: globalThis.AbortSignal.timeout(10000) });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 64);
  assert.equal((await request('/auth/logout', { token: manager, method: 'POST', body: {} })).status, 200);
  const revoked = await globalThis.fetch(`http://127.0.0.1:3037${grant.url}`, { signal: globalThis.AbortSignal.timeout(10000) });
  assert.equal(revoked.status, 403);
  console.log('Local preview HTTP passed: actual manager reciter creation; administration-only archives; student/reciter/teacher denials; three synthetic tracks; real manager Range playback and logout revocation. No external providers or microphone.');
} finally {
  for (const token of tokens) await request('/auth/logout', { token, method: 'POST', body: {} });
}
