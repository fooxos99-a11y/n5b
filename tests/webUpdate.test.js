import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredWebUpdate } from '../src/services/webUpdateService.js';

const currentBuild = '54ad18c3-d495-4118-ad2d-4f2389bac607';
const nextBuild = 'a6ef3697-7468-49ab-b35d-e26b9a5af711';
const check = buildId => hasRequiredWebUpdate({ currentBuild, baseUrl: '/n5b/', request: async (url, options) => {
  assert.match(url, /^\/n5b\/app-version\.json\?_fresh=\d+$/);
  assert.equal(options.cache, 'no-store');
  return { ok: true, json: async () => ({ buildId }) };
} });

test('web updates require a different valid deployed build and retain the deployment base', async () => {
  assert.equal(await check(currentBuild), false);
  assert.equal(await check(nextBuild), true);
  assert.equal(await check(''), false);
  assert.equal(await check('unavailable'), false);
});

test('failed and missing web manifests do not invent a required update', async () => {
  assert.equal(await hasRequiredWebUpdate({ currentBuild, baseUrl: '/', request: async () => ({ ok: false }) }), false);
  assert.equal(await hasRequiredWebUpdate({ currentBuild: '', baseUrl: '/', request: async () => assert.fail() }), false);
  await assert.rejects(hasRequiredWebUpdate({ currentBuild, baseUrl: '/', request: async () => { throw new Error('offline'); } }), /offline/);
});
