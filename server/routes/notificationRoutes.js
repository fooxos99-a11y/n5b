import express from 'express';
import { db } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';
import { loadNotificationAudience, normalizeNotification, selectNotificationRecipients } from '../services/notificationAudience.js';
import { deviceTokenHash, getNotificationPushConfig } from '../services/notificationPush.js';
import { notificationStaffRoles } from '../../shared/notification-roles.js';
import { createNotificationReadHandler } from './notificationReadHandler.js';

export const notificationRouter = express.Router();
export const notificationManagementRouter = express.Router();
notificationManagementRouter.use(requirePermission('notifications'));

notificationRouter.get('/push-status', async (req, res, next) => {
  try {
    const [[row]] = await db().query('SELECT DATABASE() AS databaseName');
    const config = getNotificationPushConfig(row.databaseName);
    res.json({ android: Boolean(config.android?.projectId && config.android?.clientEmail && config.android?.privateKey), ios: Boolean(config.ios?.teamId && config.ios?.keyId && config.ios?.privateKey && config.ios?.topic && ['production', 'sandbox'].includes(config.ios?.environment)) });
  } catch (error) { next(error); }
});
notificationRouter.post('/devices', async (req, res, next) => {
  try {
    const { platform, token } = req.body;
    if (!['android', 'ios'].includes(platform) || typeof token !== 'string' || !/^[a-zA-Z0-9:_-]{32,1024}$/.test(token)
      || (platform === 'ios' && !/^[a-f\d]+$/i.test(token))) return res.status(422).json({ message: 'بيانات الجهاز غير صالحة.' });
    await db().query(`INSERT INTO notification_devices (user_role, user_id, platform, token, token_hash, session_hash)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_role = VALUES(user_role), user_id = VALUES(user_id), token = VALUES(token), session_hash = VALUES(session_hash), updated_at = NOW()`,
    [req.auth.role, req.auth.id, platform, token, deviceTokenHash(platform, token), req.auth.tokenHash]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
notificationRouter.delete('/devices', async (req, res, next) => {
  try {
    const { platform, token } = req.body;
    if (typeof platform !== 'string' || typeof token !== 'string') return res.status(422).json({ message: 'بيانات الجهاز غير صالحة.' });
    await db().query('DELETE FROM notification_devices WHERE token_hash = ? AND user_role = ? AND user_id = ?', [deviceTokenHash(platform, token), req.auth.role, req.auth.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

notificationRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await db().query(`SELECT n.id, n.title, COALESCE(r.body_override, n.body) AS body,
      DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS createdAt, r.read_at IS NOT NULL AS isRead
      FROM app_notification_recipients r JOIN app_notifications n ON n.id = r.notification_id
      WHERE r.user_role = ? AND r.user_id = ?
      ORDER BY n.id DESC LIMIT 100`, [req.auth.role, req.auth.id]);
    res.json(rows.map((row) => ({ ...row, id: String(row.id), isRead: Boolean(row.isRead) })));
  } catch (error) { next(error); }
});
notificationRouter.post('/read', createNotificationReadHandler(db));
notificationRouter.post('/:id/read', async (req, res, next) => {
  try {
    await db().query(`UPDATE app_notification_recipients SET read_at = COALESCE(read_at, NOW())
      WHERE notification_id = ? AND user_role = ? AND user_id = ?`, [req.params.id, req.auth.role, req.auth.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
notificationManagementRouter.get('/audience', async (req, res, next) => {
  try { res.json(await loadNotificationAudience(db())); } catch (error) { next(error); }
});
notificationManagementRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await db().query(`SELECT n.id, n.title, n.body, n.created_by_name AS createdBy,
      DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS createdAt,
      COUNT(r.user_id) AS recipientCount, COALESCE(SUM(r.read_at IS NOT NULL), 0) AS readCount,
      (SELECT COUNT(*) FROM notification_push_deliveries d WHERE d.notification_id = n.id AND d.status = 'sent') AS pushSent,
      (SELECT COUNT(*) FROM notification_push_deliveries d WHERE d.notification_id = n.id AND d.status = 'pending') AS pushPending,
      (SELECT COUNT(*) FROM notification_push_deliveries d WHERE d.notification_id = n.id AND d.status = 'failed') AS pushFailed
      FROM app_notifications n LEFT JOIN app_notification_recipients r ON r.notification_id = n.id
      WHERE n.dedupe_key LIKE 'broadcast:%'
      GROUP BY n.id ORDER BY n.id DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { next(error); }
});
notificationManagementRouter.get('/:id/recipients', async (req, res, next) => {
  try {
    const [rows] = await db().query(`SELECT r.user_role AS role, r.user_id AS id,
      COALESCE(s.name, staff.name, 'حساب محذوف') AS name, r.read_at AS readAt
      FROM app_notification_recipients r
      LEFT JOIN students s ON r.user_role = 'student' AND s.id = r.user_id
      LEFT JOIN supervisors staff ON r.user_role IN (?) AND staff.role = r.user_role AND staff.id = r.user_id
      WHERE r.notification_id = ? ORDER BY name`, [notificationStaffRoles, req.params.id]);
    res.json(rows);
  } catch (error) { next(error); }
});
notificationManagementRouter.post('/', async (req, res, next) => {
  let connection;
  try {
    const payload = normalizeNotification(req.body);
    connection = await db().getConnection();
    await connection.beginTransaction();
    const key = `broadcast:${req.auth.role}:${req.auth.id}:${payload.requestId}`;
    const [[existing]] = await connection.query('SELECT id FROM app_notifications WHERE dedupe_key = ?', [key]);
    if (existing) {
      await connection.rollback();
      return res.json({ id: existing.id, duplicate: true });
    }
    const { people, committees } = await loadNotificationAudience(connection);
    const selection = req.body.selection;
    const recipients = selectNotificationRecipients(people, selection);
    if (selection.committeeIds.some((id) => !committees.some((c) => String(c.id) === String(id)))) throw Object.assign(new Error('الحلقة المحددة غير موجودة.'), { status: 422 });
    if (!recipients.length) throw Object.assign(new Error('حدد مستلمًا واحدًا على الأقل.'), { status: 422 });
    const [result] = await connection.query(`INSERT INTO app_notifications
      (title, body, dedupe_key, recipient_type, created_by_role, created_by_id, created_by_name)
      VALUES (?, ?, ?, 'specific', ?, ?, ?)`, [payload.title, payload.body, key, req.auth.role, req.auth.id, req.auth.name || 'الإدارة']);
    await connection.query('INSERT INTO app_notification_recipients (notification_id, user_role, user_id) VALUES ?',
      [recipients.map((person) => [result.insertId, person.role, person.id])]);
    await connection.query(`INSERT INTO notification_push_deliveries (notification_id, device_id, user_role, user_id)
      SELECT r.notification_id, d.id, r.user_role, r.user_id FROM app_notification_recipients r
      JOIN notification_devices d ON d.user_role = r.user_role AND d.user_id = r.user_id
      WHERE r.notification_id = ?`, [result.insertId]);
    await connection.commit();
    res.status(201).json({ id: result.insertId, recipientCount: recipients.length });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.json({ duplicate: true });
    next(error);
  } finally {
    if (connection) { await connection.rollback(); connection.release(); }
  }
});
