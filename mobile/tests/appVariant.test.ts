import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import type { ExpoConfig } from 'expo/config';

const require = createRequire(import.meta.url);
const { appVariant, PREVIEW } = require('../scripts/appVariant.cjs') as typeof import('../scripts/appVariant.cjs');
const original = require('../app.json').expo as ExpoConfig;
const previewEnv = {
  NUKHAB_APP_VARIANT: 'testflight-preview', NUKHAB_BUILD_NUMBER: '1',
  EXPO_PUBLIC_API_BASE_URL: PREVIEW.apiBaseUrl,
  EXPO_PUBLIC_REGISTRATION_NUMBER: PREVIEW.registrationNumber, EXPO_PUBLIC_NATIVE_PROBES: '0',
};

test('default configuration preserves the old installed app identity without mutation', () => {
  const before = JSON.stringify(original);
  assert.equal(appVariant(original, {}), original);
  assert.equal(original.ios?.bundleIdentifier, 'sa.nukhab.app');
  assert.equal(original.android?.package, 'sa.nukhab.app');
  const preview = appVariant(original, previewEnv);
  assert.equal(JSON.stringify(original), before);
  assert.equal(preview.ios?.bundleIdentifier, 'sa.nukhab.app.preview');
  assert.equal(preview.android?.package, 'sa.nukhab.app.preview');
  assert.equal(preview.name, 'نخب تجريبي');
  assert.equal(preview.scheme, 'nukhab-preview');
  assert.equal(preview.ios?.buildNumber, '1');
  assert.equal(preview.android?.versionCode, 1);
  assert.equal(preview.plugins, original.plugins);
});

test('preview builds reject production, local, foreign, or malformed API targets', () => {
  for (const url of ['', 'https://nokhab.cc/n5b/api', 'http://127.0.0.1:5187/api',
    'https://localhost/api', 'https://example.com/api', `${PREVIEW.apiBaseUrl}?redirect=1`,
    `${PREVIEW.apiBaseUrl}#x`, 'https://user:secret@nokhab.cc/n5b-expo-preview/api']) {
    assert.throws(() => appVariant(original, { ...previewEnv, EXPO_PUBLIC_API_BASE_URL: url }), /isolated preview/);
  }
  for (const registration of ['', '1483', 'native-preview-local']) {
    assert.throws(() => appVariant(original, { ...previewEnv, EXPO_PUBLIC_REGISTRATION_NUMBER: registration }), /isolated preview/);
  }
});

test('release configuration fails closed for unknown variants, probes and invalid build numbers', () => {
  assert.throws(() => appVariant(original, { ...previewEnv, NUKHAB_APP_VARIANT: 'production-preview' }), /Unknown/);
  for (const value of ['', '1', 'true']) {
    assert.throws(() => appVariant(original, { ...previewEnv, EXPO_PUBLIC_NATIVE_PROBES: value }), /probes/);
  }
  for (const value of ['', '0', '-1', '01', '1.2', '1000000000', 'NaN']) {
    assert.throws(() => appVariant(original, { ...previewEnv, NUKHAB_BUILD_NUMBER: value }), /build number/);
  }
});
