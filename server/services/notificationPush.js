import { sign, createHash } from 'node:crypto';
import { connect } from 'node:http2';
import { notificationStaffRoles } from '../../shared/notification-roles.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const failure = (code, permanent = false) => Object.assign(new Error(code), { code, permanent });
export const deviceTokenHash = (platform, token) => createHash('sha256').update(`${platform}:${token}`).digest('hex');

export function getNotificationPushConfig(databaseName, environment = process.env) {
  // No default credentials: each tenant must be explicitly configured independently.
  const config = JSON.parse(environment.NOTIFICATION_PUSH_CONFIG_JSON || '{}');
  return Object.hasOwn(config, databaseName) ? config[databaseName] : {};
}

async function sendAndroid(config, device, notification) {
  if (!config?.projectId || !config.clientEmail || !config.privateKey) throw failure('NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: config.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const jwt = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`;
  const authResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), signal: AbortSignal.timeout(15000),
  });
  if (!authResponse.ok) throw failure('FCM_AUTH_FAILED');
  const auth = await authResponse.json();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ message: { token: device.token, notification: { title: notification.title, body: notification.body }, data: { notificationId: String(notification.id) }, android: { priority: 'high', notification: { tag: `notification-${notification.id}` } } } }),
  });
  if (!response.ok) {
    const result = await response.json();
    const expired = result.error?.details?.some((detail) => detail.errorCode === 'UNREGISTERED');
    throw failure(expired ? 'DEVICE_UNREGISTERED' : 'FCM_SEND_FAILED', expired);
  }
}

async function sendApple(config, device, notification) {
  if (!config?.teamId || !config.keyId || !config.privateKey || !config.topic || !['production', 'sandbox'].includes(config.environment)) throw failure('NOT_CONFIGURED');
  const unsigned = `${encode({ alg: 'ES256', kid: config.keyId })}.${encode({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })}`;
  const jwt = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: config.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  await new Promise((resolve, reject) => {
    const client = connect(config.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    const timer = setTimeout(() => { client.destroy(); reject(failure('APNS_TIMEOUT')); }, 15000);
    client.on('error', () => { clearTimeout(timer); client.destroy(); reject(failure('APNS_CONNECTION_FAILED')); });
    const request = client.request({ ':method': 'POST', ':path': `/3/device/${encodeURIComponent(device.token)}`, authorization: `bearer ${jwt}`, 'apns-topic': config.topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': `notification-${notification.id}` });
    request.on('response', (headers) => {
      clearTimeout(timer); request.close(); client.close();
      if (headers[':status'] === 200) resolve();
      else reject(failure('APNS_SEND_FAILED', headers[':status'] === 410));
    });
    request.on('error', () => { clearTimeout(timer); client.destroy(); reject(failure('APNS_SEND_FAILED')); });
    request.end(JSON.stringify({ aps: { alert: { title: notification.title, body: notification.body }, sound: 'default' }, notificationId: String(notification.id) }));
  });
}

export async function processNotificationPushBatch(pool, config, send = async (device, notification) => {
  if (device.platform === 'android') await sendAndroid(config.android, device, notification);
  else await sendApple(config.ios, device, notification);
}) {
  const connection = await pool.getConnection();
  try {
    // One worker per tenant at a time, including across processes.
    const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT('push:', LEFT(SHA2(DATABASE(), 256), 50)), 0) AS acquired");
    if (!lock.acquired) return;
    const [rows] = await connection.query(`SELECT d.notification_id AS id, d.device_id AS deviceId, d.attempts,
      device.platform, device.token, n.title, n.body
      FROM notification_push_deliveries d JOIN notification_devices device ON device.id = d.device_id
      JOIN app_notifications n ON n.id = d.notification_id
      JOIN auth_sessions auth ON auth.token_hash = device.session_hash AND auth.user_role = device.user_role AND auth.user_id = device.user_id
      JOIN app_notification_recipients r ON r.notification_id = d.notification_id AND r.user_role = d.user_role AND r.user_id = d.user_id
      LEFT JOIN students recipient_student ON d.user_role = 'student' AND recipient_student.id = d.user_id
      LEFT JOIN supervisors recipient_staff ON d.user_role IN (?) AND recipient_staff.id = d.user_id
        AND recipient_staff.role = d.user_role AND recipient_staff.is_active = 1
      WHERE d.status = 'pending' AND d.next_attempt_at <= NOW()
        AND device.user_role = d.user_role AND device.user_id = d.user_id
        AND (recipient_student.id IS NOT NULL OR recipient_staff.id IS NOT NULL)
      ORDER BY d.notification_id LIMIT 25`, [notificationStaffRoles]);
    for (const row of rows) {
      try {
        await send(row, { ...row, body: Array.from(row.body).slice(0, 500).join('') });
        await connection.query("UPDATE notification_push_deliveries SET status = 'sent', attempts = attempts + 1, error_code = NULL WHERE notification_id = ? AND device_id = ?", [row.id, row.deviceId]);
      } catch (error) {
        const code = ['NOT_CONFIGURED', 'FCM_AUTH_FAILED', 'FCM_SEND_FAILED', 'DEVICE_UNREGISTERED', 'APNS_TIMEOUT', 'APNS_CONNECTION_FAILED', 'APNS_SEND_FAILED'].includes(error.code) ? error.code : 'PUSH_FAILED';
        const terminal = error.permanent || (code !== 'NOT_CONFIGURED' && Number(row.attempts) >= 4);
        await connection.query(`UPDATE notification_push_deliveries SET status = ?, attempts = attempts + ?, error_code = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
          WHERE notification_id = ? AND device_id = ?`, [terminal ? 'failed' : 'pending', code === 'NOT_CONFIGURED' ? 0 : 1, code, row.id, row.deviceId]);
      }
    }
  } finally {
    try { await connection.query("SELECT RELEASE_LOCK(CONCAT('push:', LEFT(SHA2(DATABASE(), 256), 50)))"); }
    finally { connection.release(); }
  }
}
