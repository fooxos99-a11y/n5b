import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineRecitationStore } from '../src/services/offlineRecitationStore.js';

test('offline store shares pending initialization and retries after failure', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  t.after(() => { if (original) Object.defineProperty(globalThis, 'indexedDB', original); else delete globalThis.indexedDB; });
  let opens = 0;
  let request;
  globalThis.indexedDB = { open() { opens += 1; request = {}; return request; } };
  const store = new offlineRecitationStore.constructor();
  const first = store.init();
  const second = store.init();
  assert.equal(opens, 1);
  const failed = Promise.allSettled([first, second]);
  request.error = new Error('fixture failure');
  request.onerror();
  assert.deepEqual((await failed).map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(store.initializing, null);
  const retry = store.init();
  assert.equal(opens, 2);
  request.result = {};
  request.onsuccess();
  assert.equal(await retry, store);
  assert.equal(store.driver, 'indexeddb');
  assert.equal(await store.init(), store);
  assert.equal(opens, 2);
});
