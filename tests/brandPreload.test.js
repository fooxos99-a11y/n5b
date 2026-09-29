import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
async function loadModule(entry, base = '/') {
  const bundle = await build({ entryPoints: [path.join(root, entry)], bundle: true, write: false, format: 'esm', platform: 'node',
    alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env.BASE_URL': JSON.stringify(base) } });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

test('asset URLs preserve mounted bases and external URLs', async () => {
  const { resolveAssetUrl } = await loadModule('src/lib/assetUrl.js', '/app///');
  assert.equal(resolveAssetUrl('/image.png'), '/app/image.png');
  assert.equal(resolveAssetUrl('/app/image.png'), '/app/image.png');
  assert.equal(resolveAssetUrl('https://example.test/image.png'), 'https://example.test/image.png');
  assert.equal(resolveAssetUrl('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
  const rootModule = await loadModule('src/lib/assetUrl.js');
  assert.equal(rootModule.resolveAssetUrl('image.png'), '/image.png');
});

test('brand preloading waits for decoding and tolerates missing, rejected and throwing decoders', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Image', original); else delete globalThis.Image; });
  const { preloadSiteBrandAssets } = await loadModule('src/lib/preloadBrandAssets.js');
  let release;
  let decoded = false;
  globalThis.Image = class {
    complete = true;
    decode() { return new Promise((resolve) => { release = resolve; }); }
  };
  const loading = preloadSiteBrandAssets({ logo: '/logo.png' }, { timeoutMs: 0 }).then(() => { decoded = true; });
  await Promise.resolve();
  assert.equal(decoded, false);
  release();
  await loading;
  assert.equal(decoded, true);
  for (const decode of [undefined, () => Promise.reject(new Error('bad image')), () => { throw new Error('bad image'); }]) {
    globalThis.Image = class { complete = true; decode = decode; };
    await preloadSiteBrandAssets({ logo: '/logo.png' }, { timeoutMs: 0 });
  }
});
