import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';

test('iOS gets its final viewport before theme and layout, and startup has one native owner', () => {
  const source = readFileSync(new URL('../public/theme-bootstrap.js', import.meta.url), 'utf8');
  for (const platform of ['ios','android','web']) {
    let content = 'width=device-width, initial-scale=1.0, viewport-fit=auto';
    const events = [];
    vm.runInNewContext(source, {
      Capacitor: { getPlatform: () => platform }, URLSearchParams,
      location: { pathname: '/', search: '' }, localStorage: { getItem: () => null },
      document: { documentElement: { style: {}, classList: { add: () => events.push('theme') } },
        querySelector: () => ({ getAttribute: () => content, setAttribute: (_key,value) => { content=value;events.push('viewport'); } }) },
    });
    if (platform === 'ios') {
      assert.equal(content.split('viewport-fit=').length, 2);
      assert.ok(content.endsWith('viewport-fit=cover'));
      assert.deepEqual(events, ['viewport','theme']);
    } else assert.deepEqual(events, ['theme']);
  }
  const bridge = readFileSync(new URL('../src/components/native/NativeAppBridge.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bridge, /SplashScreen/,'route changes and resume must never own native splash hiding');
});

test('every native launch image uses the same opaque startup color without a second logo', async () => {
  const root = new URL('../', import.meta.url), paths = [];
  for (const directory of await readdir(new URL('android/app/src/main/res/', root))) {
    if (directory.startsWith('drawable') && !directory.includes('.')) paths.push(new URL(`android/app/src/main/res/${directory}/splash.png`, root));
  }
  for (const name of await readdir(new URL('ios/App/App/Assets.xcassets/Splash.imageset/', root))) {
    if (name.endsWith('.png')) paths.push(new URL(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, root));
  }
  assert.equal(paths.length, 32);
  for (const path of paths) {
    const statistics = await sharp(new Uint8Array(readFileSync(path))).stats();
    assert.equal(statistics.isOpaque, true, path.href);
    assert.deepEqual(statistics.channels.slice(0,3).map(channel=>[channel.min,channel.max]), [[4,4],[67,67],[61,61]],path.href);
  }
});
