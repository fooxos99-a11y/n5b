import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getSiteConfig } from '../src/site/siteConfigs.js';
import { nativeUpdatePolicy } from '../server/services/nativeUpdate.js';

test('standalone app always resolves its own product and native identity', async () => {
  for (const key of [undefined, 'nukhab', 'nukhab', 'unknown-product']) {
    assert.equal(getSiteConfig(key).key, 'nukhab');
    assert.equal(getSiteConfig(key).publicUrl, 'https://161.97.171.108.sslip.io/n5b/');
  }
  const cap = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(cap.appId, 'sa.nukhab.app');
  assert.equal(cap.appName, 'نخب');
  assert.deepEqual(await nativeUpdatePolicy('org.example.other', 'android'), { available: false });
});

test('standalone build scripts and Android flavors only target this app', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.scripts['native:android']);
  assert.ok(pkg.scripts['native:ios']);
  assert.ok(Object.keys(pkg.scripts).filter(key => key.startsWith('native:android')).length === 1);
  const gradle = await readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  assert.deepEqual([...gradle.matchAll(/applicationId "([^"]+)"/g)].map(match => match[1]), ['sa.nukhab.app']);
  const spm = await readFile(new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(spm, /[A-Z]:[\\/]/);
});
