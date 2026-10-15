import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { PREVIEW } = createRequire(import.meta.url)('../mobile/scripts/appVariant.cjs');
const access = JSON.parse(await readFile(process.env.NUKHAB_PREVIEW_ACCESS_FILE, 'utf8'));
assert.equal(access.registration, PREVIEW.registrationNumber);
const results = [];
const sessions = [];
async function request(name, path, expected, { method = 'GET', body, token, registration = access.registration } = {}) {
  const response = await fetch(PREVIEW.apiBaseUrl + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1',
      ...(registration ? { 'X-Registration-Number': registration } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.headers.get('x-nukhab-environment'), 'expo-preview', name);
  assert.equal(response.status, expected, `${name}: HTTP ${response.status}`);
  const value = await response.json();
  results.push({ name, status: response.status });
  return value;
}
try {
  await request('Dedicated HTTPS health', '/health', 200, { registration: '' });
  await request('Registration is required', '/auth/session', 403, { registration: '' });
  await request('Production registration denied at boundary', '/auth/session', 403, { registration: '1483' });
  await request('Foreign tenant denied at boundary', '/auth/session', 403, { registration: 'foreign-preview' });
  await request('Platform administration unavailable', '/platform/auth/login', 403, { method: 'POST', body: {} });
  await request('Session requires authentication', '/auth/session', 401);
  await request('Unknown bearer rejected', '/auth/session', 401, { token: 'f'.repeat(64) });
  await request('Wrong password rejected', '/auth/login', 401, {
    method: 'POST', body: { loginNumber: access.accounts.manager, password: 'Incorrect-preview-password' },
  });
  const identities = {};
  for (const [key, role] of [['manager', 'manager'], ['student', 'student'],
    ['supervisor', 'supervisor'], ['admin', 'admin'], ['ungrantedAdmin', 'admin']]) {
    const identity = await request(`${key} login`, '/auth/login', 200, {
      method: 'POST', body: { loginNumber: access.accounts[key], password: access.password },
    });
    assert.equal(identity.role, role);
    assert.match(identity.token, /^[a-f0-9]{64}$/);
    assert.equal(identity.complex.registrationNumber, access.registration);
    assert.equal(identity.apiBase, PREVIEW.apiBaseUrl);
    identities[key] = identity;
    sessions.push(identity.token);
    await request(`${key} session restoration`, '/auth/session', 200, { token: identity.token });
  }
  await request('Manager notification access', '/notification-management', 200, { token: identities.manager.token });
  await request('Granted administrator access', '/notification-management', 200, { token: identities.admin.token });
  for (const key of ['student', 'supervisor', 'ungrantedAdmin']) {
    await request(`${key} notification management denied`, '/notification-management', 403, { token: identities[key].token });
  }
  await request('Authenticated foreign registration denied', '/auth/session', 403, {
    registration: '1483', token: identities.manager.token,
  });
  for (const token of sessions) {
    await request('Revoke only verification session', '/auth/logout', 200, { method: 'POST', token });
    await request('Revoked session denied', '/auth/session', 401, { token });
  }
  sessions.length = 0;
  const evidence = { capturedAt: new Date().toISOString(), api: PREVIEW.apiBaseUrl,
    syntheticOnly: true, actualIPhone: false, results, passed: results.length };
  await writeFile(process.env.NUKHAB_PREVIEW_EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
  console.info(`Preview HTTPS isolation and authentication: ${results.length} checks passed`);
} finally {
  for (const token of sessions) {
    await fetch(PREVIEW.apiBaseUrl + '/auth/logout', { method: 'POST',
      headers: { 'X-Nukhab-Native': '1', 'X-Registration-Number': access.registration,
        Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  }
}
