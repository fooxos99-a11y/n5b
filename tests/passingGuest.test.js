import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { authenticatePassingGuest, isPassingGuestRequest, normalizeReciterName, openPassingGuestSession, passingTokenHash, loadPassingGuestSession } from '../server/services/passingGuest.js';
import { passingNotificationTarget, parsePassingNotificationAction } from '../shared/passing-notification.js';

test('passing entry accepts a normalized reciter name and rejects missing, oversized or hidden input', () => {
  assert.equal(normalizeReciterName('  مقرئ   الاختبار  '), 'مقرئ الاختبار');
  for (const value of [null, {}, '', ' ', 'أ', 'أ'.repeat(161), '<script>', 'مقرئ\u200b']) assert.throws(() => normalizeReciterName(value), { status: 422 });
});
test('guest credentials cannot turn unrelated or malformed routes into a public API', () => {
  for (const path of ['/passing/guest', '/passing/guest/students']) assert.equal(isPassingGuestRequest({ path, get: () => '' }), true);
  assert.equal(isPassingGuestRequest({ path: '/passing/guestly', get: () => '' }), false);
  assert.equal(isPassingGuestRequest({ path: '/settings', get: header => header === 'x-passing-session' ? 'secret' : '' }), true);
});
test('guest credentials are hashed, names are server-owned, and sessions fail after revocation or expiry', async () => {
  const link = randomBytes(32).toString('hex');
  let enabledHash = passingTokenHash(link), session, expired = false;
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT setting_value')) return [[{ hash: enabledHash }]];
    if (sql.startsWith('DELETE')) return [{}];
    if (sql.startsWith('INSERT')) { session = { tokenHash: params[0], linkHash: params[1], name: params[2] }; return [{}]; }
    if (sql.startsWith('SELECT g.id')) return [[session && session.tokenHash === params[1] && session.linkHash === enabledHash && !expired ? { id: 12, name: session.name } : undefined].filter(Boolean)];
    throw new Error('Unexpected database operation');
  } };
  await assert.rejects(openPassingGuestSession(connection, { linkToken: '0'.repeat(64), name: 'مقرئ' }), { status: 403 });
  const opened = await openPassingGuestSession(connection, { linkToken: link, name: 'مقرئ الاختبار' });
  assert.notEqual(opened.token, session.tokenHash);
  assert.deepEqual(await loadPassingGuestSession(connection, opened.token), { role: 'passing_guest', id: 12, name: 'مقرئ الاختبار' });
  expired = true;
  await assert.rejects(loadPassingGuestSession(connection, opened.token), { status: 401 });
  expired = false; enabledHash = passingTokenHash('rotated');
  await assert.rejects(loadPassingGuestSession(connection, opened.token), { status: 401 });
  await assert.rejects(loadPassingGuestSession(connection, 'not-a-session'), { status: 401 });
});
test('guest middleware blocks settings, notification access, wrong verbs and ordinary passing routes even with a staff cookie', async () => {
  const app = express();
  app.use(express.json());
  app.use(authenticatePassingGuest(() => { throw new Error('Blocked routes must not query accounts'); }));
  app.use((_req, res) => res.json({ leaked: true }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [method, path] of [['GET', '/api/settings'], ['GET', '/api/notifications'], ['GET', '/api/passing/students'], ['PUT', '/api/passing/guest/policy'], ['GET', '/api/passing/guest/policy'], ['DELETE', '/api/passing/guest/parts/1'], ['POST', '/api/passing/guest/students/1/parts']]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'X-Passing-Session': 'a'.repeat(64), Cookie: 'nukhab_session=staff' } });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal((await response.json()).leaked, undefined);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('notification links accept only an internal passing report with valid student, type and juz', () => {
  const action = { kind: 'passing', studentId: 3, type: 'hafiz', juz: 30 };
  assert.equal(passingNotificationTarget(action), '/dashboard/passing?studentId=3&type=hafiz&juz=30');
  assert.deepEqual(parsePassingNotificationAction(JSON.stringify({ ...action, url: 'https://example.com' })), action);
  for (const value of [null, '{bad', { ...action, juz: 31 }, { ...action, studentId: '3' }, { ...action, kind: 'redirect' }, { ...action, type: '../settings' }]) assert.equal(parsePassingNotificationAction(value), null);
});
