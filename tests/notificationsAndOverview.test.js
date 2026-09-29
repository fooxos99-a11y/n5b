import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { loadNotificationAudience, normalizeNotification, selectNotificationRecipients } from '../server/services/notificationAudience.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { getNotificationPushConfig, processNotificationPushBatch } from '../server/services/notificationPush.js';

test('notification audience combines roles, committees and people without duplicates or role/id collisions', () => {
  const people = [{ id: 1, role: 'student', committeeId: 2 }, { id: 2, role: 'student', committeeId: 3 }, { id: 1, role: 'supervisor' }, { id: 1, role: 'admin' }];
  assert.deepEqual(selectNotificationRecipients(people, { roles: ['student'], committeeIds: ['2'], people: ['student:1', 'supervisor:1'] }), people.slice(0, 3));
  assert.deepEqual(selectNotificationRecipients(people, { roles: [], committeeIds: ['2'], people: ['admin:1'] }), [people[0], people[3]]);
  assert.throws(() => selectNotificationRecipients(people, { roles: ['platform_owner'], committeeIds: [], people: [] }), { status: 422 });
  assert.throws(() => selectNotificationRecipients(people, { roles: [], committeeIds: [], people: ['student:99'] }), { status: 422 });
  assert.throws(() => normalizeNotification({ title: 'عنوان', body: '', requestId: crypto.randomUUID() }), { status: 422 });
});

test('overview binds scope values in query order and rejects invalid filters', async () => {
  const calls = [];
  const scope = createOverviewReportScope({ query: async (sql, values) => { calls.push({ sql, values }); return [[]]; } }, { auth: { role: 'supervisor', id: 7 }, committeeId: 20 });
  await scope.query(`SELECT * FROM students s WHERE s.id > ? AND ${scope.student('s.id')} AND s.id < ?`, [0, 99]);
  assert.deepEqual(calls[0].values, [0, 7, 20, 99]);
  assert.match(calls[0].sql, /supervisor_committees/);
  assert.doesNotMatch(calls[0].sql, /:overview/);
  assert.throws(() => createOverviewReportScope({}, { committeeId: '1 OR 1=1' }), { status: 422 });
});

test('notification credentials never fall back to another tenant', () => {
  const environment = { NOTIFICATION_PUSH_CONFIG_JSON: JSON.stringify({ first: { android: { projectId: 'first' } } }) };
  assert.deepEqual(getNotificationPushConfig('second', environment), {});
  assert.equal(getNotificationPushConfig('first', environment).android.projectId, 'first');
});

test('push worker distinguishes accepted, retryable, unconfigured and invalid devices', async () => {
  const updates = [];
  let released = false;
  const connection = {
    query: async (sql, values) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('SELECT d.notification_id')) {
        assert.match(sql, /JOIN auth_sessions/);
        assert.match(sql, /device.user_role = d.user_role AND device.user_id = d.user_id/);
        return [[1, 2, 3, 4].map((id) => ({ id, deviceId: id, attempts: 0, body: 'نص', title: 'عنوان' }))];
      }
      if (sql.startsWith('UPDATE')) updates.push({ sql, values });
      return [{}];
    },
    release: () => { released = true; },
  };
  await processNotificationPushBatch({ getConnection: async () => connection }, {}, async (device) => {
    if (device.id === 2) throw Object.assign(new Error(), { code: 'NOT_CONFIGURED' });
    if (device.id === 3) throw Object.assign(new Error(), { code: 'FCM_SEND_FAILED' });
    if (device.id === 4) throw Object.assign(new Error(), { code: 'DEVICE_UNREGISTERED', permanent: true });
  });
  assert.match(updates[0].sql, /status = 'sent'/);
  assert.deepEqual(updates[1].values.slice(0, 3), ['pending', 0, 'NOT_CONFIGURED']);
  assert.deepEqual(updates[2].values.slice(0, 3), ['pending', 1, 'FCM_SEND_FAILED']);
  assert.deepEqual(updates[3].values.slice(0, 3), ['failed', 1, 'DEVICE_UNREGISTERED']);
  assert.equal(released, true);
});

test('notification routes bind inbox ownership and queue deliveries in the same transaction', async () => {
  const routes = await readFile(new URL('../server/routes/notificationRoutes.js', import.meta.url), 'utf8');
  assert.match(routes, /notificationManagementRouter.use\(requirePermission\('notifications'\)\)/);
  assert.match(routes, /WHERE r.user_role = \? AND r.user_id = \?/);
  assert.match(routes, /WHERE notification_id = \? AND user_role = \? AND user_id = \?/);
  assert.ok(routes.indexOf('INSERT INTO notification_push_deliveries') < routes.indexOf('await connection.commit()'));
  assert.match(routes, /broadcast:\$\{req.auth.role\}:\$\{req.auth.id\}:\$\{payload.requestId\}/);
});

test('overview and its export send the selected committee to the server', async () => {
  const api = await readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8');
  for (const method of ['getOverviewReport', 'exportOverviewReport']) {
    const start = api.indexOf(`  ${method}: `) + `  ${method}: `.length;
    const expression = api.slice(start, api.indexOf('\n  },', start) + 4);
    const urls = [];
    const call = vm.runInNewContext(`(${expression})`, { URLSearchParams, request: (url) => urls.push(url), requestFile: (url) => urls.push(url) });
    call({ from: '2026-09-01', to: '2026-09-05', committeeId: '20' });
    assert.equal(new URL(urls[0], 'https://example.test').searchParams.get('committeeId'), '20');
  }
});


test('tenant managers are selectable notification recipients without including platform owners', async () => {
  const people = [{ id: 7, role: 'manager' }, { id: 7, role: 'admin' }, { id: 8, role: 'supervisor' }];
  const audience = await loadNotificationAudience({ query: async (sql, values) => {
    if (!sql.includes('FROM supervisors')) return [[]];
    assert.ok(values[0].includes('manager'));
    assert.ok(values[0].includes('admin'));
    assert.ok(values[0].includes('supervisor'));
    assert.ok(!values[0].includes('reciter'));
    assert.ok(!values[0].includes('platform_owner'));
    return [people];
  } });
  assert.deepEqual(selectNotificationRecipients(audience.people, { roles: ['manager'], committeeIds: [], people: [] }), [people[0]]);
});
