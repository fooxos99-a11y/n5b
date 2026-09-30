import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getNativeBarAppearance, syncNativeSystemBars, createNativeBarSynchronizer } from '../src/lib/nativeSystemBars.js';

test('disposing an in-flight native update cancels queued updates and future requests', async () => {
  let release;
  let calls = 0;
  const sync = createNativeBarSynchronizer({
    readAppearance: () => ({ color: '#ffffff', style: 'LIGHT' }),
    applyAppearance: () => { calls += 1; return new Promise((resolve) => { release = resolve; }); },
    onSuccess: () => {}, onError: assert.fail,
  });
  const running = sync.request();
  sync.request(true);
  sync.dispose();
  release();
  await running;
  await sync.request(true);
  assert.equal(calls, 1);
});

test('native bar follows the actual page color, with readable icons and Mushaf overrides', () => {
  const root = { dataset: {}, classList: { contains: () => true } };
  assert.deepEqual(getNativeBarAppearance(root, 'rgb(0, 31, 41)'), { color: '#001f29', style: 'DARK' });
  root.dataset.nativeSurface = 'light';
  assert.deepEqual(getNativeBarAppearance(root, 'rgb(241, 245, 249)'), { color: '#f1f5f9', style: 'LIGHT' });
  root.classList.contains = () => false;
  root.dataset.nativeSurface = 'dark';
  assert.equal(getNativeBarAppearance(root, 'rgb(17, 24, 39)').style, 'DARK');
});

test('iOS paints a non-overlay bar and has exactly one owner of the top inset', async () => {
  const calls = [];
  const statusBar = Object.fromEntries(['setStyle', 'setBackgroundColor', 'setOverlaysWebView'].map((method) => [method, async (value) => calls.push([method, value])]));
  await syncNativeSystemBars({ platform: 'ios', appearance: { color: '#002926', style: 'DARK' }, statusBar,
    systemBars: { setStyle: () => assert.fail('Do not race two iOS bar style APIs') } });
  assert.deepEqual(calls, [['setBackgroundColor', { color: '#002926' }], ['setOverlaysWebView', { overlay: false }], ['setStyle', { style: 'DARK' }]]);
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.ios.contentInset, 'never');
  assert.equal(config.plugins.StatusBar.overlaysWebView, false);
});

test('Android retains SystemBars handling without resizing its edge-to-edge webview', async () => {
  const calls = [];
  await syncNativeSystemBars({ platform: 'android', appearance: { color: '#ffffff', style: 'LIGHT' },
    statusBar: { setBackgroundColor: async (value) => calls.push(value), setOverlaysWebView: () => assert.fail('Android insets belong to SystemBars') },
    systemBars: { setStyle: async (value) => calls.push(value) } });
  assert.deepEqual(calls, [{ style: 'LIGHT' }, { color: '#ffffff' }]);
});


test('native background updates after delayed palette changes and serializes rapid navigation', async () => {
  let appearance = { color: '#ffffff', style: 'DARK' };
  let release;
  const calls = [];
  const sync = createNativeBarSynchronizer({
    readAppearance: () => appearance,
    applyAppearance: async (value) => {
      calls.push(value);
      if (calls.length === 1) await new Promise((resolve) => { release = resolve; });
    },
    onSuccess: () => {}, onError: assert.fail,
  });
  const pending = sync.request();
  appearance = { color: '#002926', style: 'DARK' };
  sync.request();
  release();
  await pending;
  assert.deepEqual(calls, [{ color: '#ffffff', style: 'DARK' }, appearance]);
  await sync.request();
  assert.equal(calls.length, 2);
  await sync.request(true);
  assert.equal(calls.length, 3, 'Resume reapplies native chrome');
  sync.dispose();
  await sync.request();
  assert.equal(calls.length, 3);
  const source = await readFile(new URL('../src/hooks/useNativeSystemBars.js', import.meta.url), 'utf8');
  assert.match(source, /attributeFilter: \['class', 'style', 'data-native-surface', 'data-startup-active'\]/);
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appName, 'نخب');
  assert.equal(config.plugins.StatusBar.backgroundColor, '#04433D');
  assert.equal(config.plugins.StatusBar.style, 'DARK');
});

test('startup overrides a light page until the splash finishes', () => {
  const root = { dataset: { startupActive: 'true', nativeSurface: 'light' }, classList: { contains: () => false } };
  assert.deepEqual(getNativeBarAppearance(root, 'rgb(255, 255, 255)'), { color: '#04433d', style: 'DARK' });
  root.dataset.startupActive = 'false';
  assert.deepEqual(getNativeBarAppearance(root, 'rgb(255, 255, 255)'), { color: '#ffffff', style: 'LIGHT' });
});
