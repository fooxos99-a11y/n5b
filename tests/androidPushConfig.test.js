import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndroidPushConfig } from '../scripts/lib/android-push-config.mjs';

const config = (packageName) => ({
  project_info: { project_id: 'test-project', project_number: '123' },
  client: [{ client_info: { mobilesdk_app_id: 'test-app', android_client_info: { package_name: packageName } }, api_key: [{ current_key: 'test-client-key' }] }],
});

test('release push validation prevents missing registration and cross-brand configuration', () => {
  assert.throws(() => validateAndroidPushConfig({}, 'sa.nukhab.app'), /missing/);
  assert.throws(() => validateAndroidPushConfig(config('org.example.other'), 'sa.nukhab.app'), /exclusively/);
  const multiple = config('sa.nukhab.app');
  multiple.client.push(config('org.example.other').client[0]);
  assert.throws(() => validateAndroidPushConfig(multiple, 'sa.nukhab.app'), /exclusively/);
  const incomplete = config('sa.nukhab.app');
  incomplete.client[0].api_key = [];
  assert.throws(() => validateAndroidPushConfig(incomplete, 'sa.nukhab.app'), /incomplete/);
  for (const id of ['sa.nukhab.app', 'org.example.other']) {
    assert.doesNotThrow(() => validateAndroidPushConfig(config(id), id));
  }
});
