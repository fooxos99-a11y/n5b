import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  NUKHAB_ANDROID_APK_URL,
  detectDownloadPlatform,
  getDownloadPlatformLinks,
} from '../src/lib/downloadPlatform.js';

test('download route sends Android directly to the signed APK and iOS to Nukhab on App Store', () => {
  assert.equal(detectDownloadPlatform('Mozilla/5.0 (Linux; Android 15)'), 'android');
  assert.equal(detectDownloadPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'), 'ios');
  assert.equal(detectDownloadPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), 'ios');
  assert.equal(detectDownloadPlatform('Mozilla/5.0 (Windows NT 10.0)'), 'other');
  assert.equal(NUKHAB_ANDROID_APK_URL, '/downloads/nukhab-android-1.0.24.apk');
  assert.equal(getDownloadPlatformLinks({ appStoreUrl: '' }).ios, '');
  const page = readFileSync(new URL('../src/pages/DownloadApp.jsx', import.meta.url), 'utf8');
  assert.match(page, /site\.squareLogo \|\| site\.markLogo \|\| site\.logo/);
  assert.match(page, /<bdi dir="ltr" className="inline-block shrink-0">Android<\/bdi>/);
  assert.match(page, /<bdi dir="ltr" className="inline-block shrink-0">App Store<\/bdi>/);
  assert.doesNotMatch(page, /اختر نسخة جهازك|نسخة Android موقعة رسميًا من رواسي/);
});

test('Exampleh download route uses its own signed APK and App Store application', () => {
  assert.deepEqual(getDownloadPlatformLinks({
    androidDownloadUrl: '/downloads/example-android-1.0.2.apk',
    appStoreUrl: 'https://apps.apple.com/app/id6805284064',
  }), {
    android: '/downloads/example-android-1.0.2.apk',
    ios: 'https://apps.apple.com/app/id6805284064',
  });
});

test('native builds never package downloadable APK files inside the application', () => {
  const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const packageFile = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const nativeCleaner = readFileSync(new URL('../scripts/remove-native-download-artifacts.mjs', import.meta.url), 'utf8');
  assert.match(viteConfig, /exclude-download-artifacts-from-native-builds/);
  assert.match(viteConfig, /rmSync\(path\.resolve\(process\.cwd\(\), resolvedOutDir, 'downloads'\)/);
  assert.match(packageFile, /remove-native-download-artifacts\.mjs android/);
  assert.match(packageFile, /remove-native-download-artifacts\.mjs ios/);
  assert.match(nativeCleaner, /assets', 'public', 'downloads/);
});
