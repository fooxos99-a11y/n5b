import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
for (const path of ['/', '/n5b/']) {
  test(`offline installation caches the startup controller and white logo under ${path}`, async () => {
    const listeners = {};
    const cached = [];
    let activated = false;
    vm.runInNewContext(source, {
      URL,
      caches: { open: async () => ({ add: async (url) => {
        cached.push(url);
        if (url.endsWith('cairo-arabic.woff2')) throw new Error('Test-only font request failure');
      } }) },
      self: {
        location: new URL(`https://test.local${path}sw.js`),
        registration: { scope: `https://test.local${path}` },
        addEventListener: (name, listener) => { listeners[name] = listener; },
        skipWaiting: async () => { activated = true; },
      },
    });
    let installed;
    listeners.install({ waitUntil: (promise) => { installed = promise; } });
    await installed;
    assert.ok(cached.includes(`${path}startup-bootstrap.js`));
    assert.ok(cached.includes(`${path}branding/nukhab/nukhab-white-640.webp`));
    assert.equal(activated, true, 'one unavailable asset must not block installation');
  });
}
