import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('cache storage failures preserve successful network pages', async () => {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function fetchAndCache');
  const end = source.indexOf("self.addEventListener('install'", start);
  const response = new Response('<html>login</html>', { status: 200 });
  const context = vm.createContext({ CACHE_NAME: 'test', fetch: async () => response,
    caches: { open: async () => ({ put: async () => { throw new Error('QuotaExceededError'); } }) } });
  vm.runInContext(source.slice(start, end), context);
  const actual = await context.fetchAndCache({ method: 'GET' });
  assert.equal(actual, response);
  assert.equal(await actual.text(), '<html>login</html>');
});

test('background preparation checks authentication again after each awaited account operation', () => {
  const source = readFileSync(new URL('../src/components/native/OfflineRecitationSyncBridge.jsx', import.meta.url), 'utf8');
  assert.match(source, /active && hasAuthSession\(\) && sessionVersion === getAuthSessionVersion\(\)/);
  assert.match(source, /await syncOfflineRecitations[^\n]+\n\s+if \(!isCurrent\(\)\) return;/);
  assert.match(source, /await prepareOfflineRecitationWorkspace[^\n]+\n\s+if \(!isCurrent\(\)\) return;/);
});
