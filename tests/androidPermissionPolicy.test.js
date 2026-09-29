import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Android excludes unused background-runner privileges while preserving foreground features', () => {
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  for (const permission of ['ACCESS_BACKGROUND_LOCATION', 'SCHEDULE_EXACT_ALARM']) {
    assert.match(manifest, new RegExp(`<uses-permission\\s+android:name="android.permission.${permission}"\\s+tools:node="remove"\\s*/>`));
  }
  for (const permission of ['INTERNET', 'CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION']) {
    assert.match(manifest, new RegExp(`<uses-permission\\s+android:name="android.permission.${permission}"\\s*/>`));
  }
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});
