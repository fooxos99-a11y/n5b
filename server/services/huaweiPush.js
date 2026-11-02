const failure = (code, permanent = false) => Object.assign(new Error(code), { code, permanent });

export const isHuaweiPushConfigured = (config) => Boolean(config && /^\d+$/.test(String(config.appId || ''))
  && /^\d+$/.test(String(config.clientId || '')) && config.clientSecret);

export async function sendHuaweiPush(config, device, notification, fetcher = fetch) {
  if (!isHuaweiPushConfigured(config)) throw failure('NOT_CONFIGURED');
  const notificationId = String(notification.id);
  if (!/^\d+$/.test(notificationId)) throw failure('HMS_PAYLOAD_INVALID', true);
  const authResponse = await fetcher('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: String(config.clientId), client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(15000),
  });
  if (!authResponse.ok) throw failure('HMS_AUTH_FAILED');
  const auth = await authResponse.json();
  if (!auth.access_token) throw failure('HMS_AUTH_FAILED');
  const response = await fetcher(`https://push-api.cloud.huawei.com/v1/${config.appId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ validate_only: false, message: {
      token: [device.token],
      data: JSON.stringify({ notificationId }),
      notification: { title: notification.title, body: notification.body },
      android: { notification: { tag: `notification-${notificationId}`, click_action: {
        type: 1,
        intent: `intent://nokhab.cc/notification#Intent;scheme=nukhab;component=sa.nukhab.app/.MainActivity;S.nukhabNotificationId=${notificationId};end`,
      } } },
    } }),
  });
  if (!response.ok) throw failure('HMS_SEND_FAILED');
  const result = await response.json();
  if (String(result.code) === '80300007') throw failure('DEVICE_UNREGISTERED', true);
  if (String(result.code) !== '80000000') throw failure('HMS_SEND_FAILED');
}
