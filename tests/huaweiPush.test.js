import assert from 'node:assert/strict';
import test from 'node:test';
import { isHuaweiPushConfigured, sendHuaweiPush } from '../server/services/huaweiPush.js';
import { validateHuaweiPushConfig } from '../scripts/lib/android-push-config.mjs';
import { down } from '../server/migrations/2026.11.02.1-huawei-notification-devices.js';

const config = { appId: '123', clientId: '456', clientSecret: 'fixture-secret' };
const device = { token: 'fixture-token' };
const notification = { id: 42, title: 'عنوان', body: 'رسالة' };
const json = (value, ok = true) => ({ ok, json: async () => value });

test('Huawei delivery uses its own credentials, preserves Arabic and deep-links to the existing native app', async () => {
  const calls = [];
  await sendHuaweiPush(config, device, notification, async (url, options) => {
    calls.push({ url, options });
    return json(calls.length === 1 ? { access_token: 'fixture-access' } : { code: '80000000' });
  });
  assert.equal(calls[0].url, 'https://oauth-login.cloud.huawei.com/oauth2/v3/token');
  assert.equal(calls[0].options.body.get('client_id'), '456');
  assert.equal(calls[1].url, 'https://push-api.cloud.huawei.com/v1/123/messages:send');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fixture-access');
  const payload = JSON.parse(calls[1].options.body);
  assert.deepEqual(payload.message.token, ['fixture-token']);
  assert.deepEqual(payload.message.notification, { title: 'عنوان', body: 'رسالة' });
  assert.match(payload.message.android.notification.click_action.intent, /component=sa\.nukhab\.app\/\.MainActivity;S.nukhabNotificationId=42;/);
  assert.doesNotMatch(calls[1].options.body, /fixture-secret/);
});

test('Huawei rejects missing or unsafe configuration before networking', async () => {
  assert.equal(isHuaweiPushConfigured({}), false);
  for (const candidate of [{}, { ...config, appId: '../other' }, { ...config, clientId: '' }]) {
    await assert.rejects(sendHuaweiPush(candidate, device, notification, () => assert.fail('No network expected')), { code: 'NOT_CONFIGURED' });
  }
  await assert.rejects(sendHuaweiPush(config, device, { ...notification, id: '42;S.extra=1' }, () => assert.fail('No network expected')), { code: 'HMS_PAYLOAD_INVALID', permanent: true });
});

test('Huawei auth, transport and API-level errors cannot be mistaken for a delivered notification', async () => {
  for (const [auth, response, code, permanent] of [
    [json({}, false), null, 'HMS_AUTH_FAILED', false],
    [json({}), null, 'HMS_AUTH_FAILED', false],
    [json({ access_token: 'ok' }), json({}, false), 'HMS_SEND_FAILED', false],
    [json({ access_token: 'ok' }), json({ code: '80300007' }), 'DEVICE_UNREGISTERED', true],
    [json({ access_token: 'ok' }), json({ code: '80100000' }), 'HMS_SEND_FAILED', false],
  ]) {
    let requests = 0;
    await assert.rejects(sendHuaweiPush(config, device, notification, async () => ++requests === 1 ? auth : response), { code, permanent });
  }
});

test('Huawei package validation refuses another app and server secrets including nested ones', () => {
  const client = { client: { app_id: '123', project_id: '456', package_name: 'sa.nukhab.app' }, app_info: { package_name: 'sa.nukhab.app' } };
  validateHuaweiPushConfig(client, 'sa.nukhab.app');
  assert.throws(() => validateHuaweiPushConfig(client, 'other.app'), /exclusively/);
  assert.throws(() => validateHuaweiPushConfig({ ...client, client: { ...client.client, client_secret: 'secret' } }, 'sa.nukhab.app'), /server client secrets/);
  assert.throws(() => validateHuaweiPushConfig({ ...client, appInfos: [{ client_secret: 'secret' }] }, 'sa.nukhab.app'), /server client secrets/);
});

test('Huawei migration rollback refuses to discard registered device identities', async () => {
  const statements = [];
  await assert.rejects(down({ query: async (sql) => { statements.push(sql); return [[{ total: 1 }]]; } }), /retained/);
  assert.equal(statements.length, 1);
  await down({ query: async (sql) => { statements.push(sql); return [[{ total: 0 }]]; } });
  assert.match(statements.at(-1), /ENUM\('android', 'ios'\)/);
});
