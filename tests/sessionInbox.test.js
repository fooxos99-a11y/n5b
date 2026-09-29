import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createNotificationReadHandler } from '../server/routes/notificationReadHandler.js';
import { processNotificationPushBatch } from '../server/services/notificationPush.js';

test('queued pushes follow the current manager account and exclude the device previous account', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE notification_push_deliveries (notification_id, device_id, attempts, user_role, user_id, status, next_attempt_at, error_code);
      CREATE TABLE notification_devices (id, platform, token, session_hash, user_role, user_id);
      CREATE TABLE app_notifications (id, title, body, dedupe_key);
      CREATE TABLE auth_sessions (token_hash, user_role, user_id);
      CREATE TABLE app_notification_recipients (notification_id, user_role, user_id);
      CREATE TABLE students (id);
      CREATE TABLE supervisors (id, role, is_active);
      INSERT INTO students VALUES (4);
      INSERT INTO supervisors VALUES (7,'manager',1);
      INSERT INTO notification_devices VALUES (1,'ios','fixture-token','fixture-session','manager',7);
      INSERT INTO auth_sessions VALUES ('fixture-session','manager',7);
      INSERT INTO app_notifications VALUES (1,'old','old',NULL),(2,'current','current',NULL),(3,'old role','old role',NULL);
      INSERT INTO app_notification_recipients VALUES (1,'student',4),(2,'manager',7),(3,'admin',7);
      INSERT INTO notification_push_deliveries VALUES
        (1,1,0,'student',4,'pending','2020-01-01',NULL),
        (2,1,0,'manager',7,'pending','2020-01-01',NULL),
        (3,1,0,'admin',7,'pending','2020-01-01',NULL);`);
    const sent = [];
    const connection = { release() {}, query: async (sql, values = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[]];
      if (sql.startsWith('SELECT')) {
        const [roles, ...rest] = values;
        return [database.prepare(sql.replace('IN (?)', `IN (${roles.map(() => '?').join(',')})`).replaceAll('NOW()', 'CURRENT_TIMESTAMP')).all(...roles, ...rest)];
      }
      return [database.prepare(sql).run(...values)];
    } };
    await processNotificationPushBatch({ getConnection: async () => connection }, {}, async (device) => sent.push(device.id));
    assert.deepEqual(sent, [2]);
    database.exec("UPDATE notification_push_deliveries SET status='pending'; UPDATE supervisors SET role='supervisor'");
    await processNotificationPushBatch({ getConnection: async () => connection }, {}, async (device) => sent.push(device.id));
    assert.deepEqual(sent, [2], 'A changed staff role cannot receive queued messages for the previous role');
  } finally { database.close(); }
});

test('opening the inbox marks only supplied messages belonging to the authenticated role and account', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE app_notification_recipients (notification_id, user_role, user_id, read_at);
      INSERT INTO app_notification_recipients VALUES (1,'student',7,NULL),(2,'student',8,NULL),
        (3,'supervisor',7,NULL),(4,'student',7,NULL);`);
    const readNotifications = createNotificationReadHandler(() => ({ query: async (sql, values) => {
      const ids = values.at(-1);
      database.prepare(sql.replace('NOW()', 'CURRENT_TIMESTAMP').replace('IN (?)', `IN (${ids.map(() => '?').join(',')})`))
        .run(...values.slice(0, -1), ...ids);
    } }));
    let status = 200;
    const res = { status(value) { status = value; return this; }, json() {} };
    await readNotifications({ auth: { role: 'student', id: 7 }, body: { ids: [1, 2, 3] } }, res, (error) => { throw error; });
    assert.equal(status, 200);
    assert.deepEqual(database.prepare('SELECT notification_id FROM app_notification_recipients WHERE read_at IS NOT NULL').all().map((r) => r.notification_id), [1]);
    await readNotifications({ auth: { role: 'student', id: 7 }, body: { ids: ['1 OR 1=1'] } }, res, (error) => { throw error; });
    assert.equal(status, 422);
  } finally { database.close(); }
});
