import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountDeviceId, migrateLegacyRecitationDevice } from '../src/lib/recitationDeviceIdentity.js';

function fixture(sessions = []) {
  const meta = new Map([['device_id', 'legacy-device']]);
  const updates = [];
  return { meta, updates,
    getMeta: async key => meta.get(key),
    setMeta: async (key, value) => meta.set(key, value),
    getSessions: async actorKey => sessions.filter(row => row.actorKey === actorKey),
    updateSession: async (actorKey, sessionId, patch) => updates.push({ actorKey, sessionId, patch }),
  };
}

test('device identity is stable per account, isolated per tenant and safe during concurrent preparation', async () => {
  const store = fixture();
  const [first, concurrent] = await Promise.all([getAccountDeviceId(store, 'a:supervisor:1'), getAccountDeviceId(store, 'a:supervisor:1')]);
  assert.equal(first, concurrent);
  assert.equal(await getAccountDeviceId(store, 'a:supervisor:1'), first);
  assert.notEqual(await getAccountDeviceId(store, 'a:supervisor:2'), first);
  assert.notEqual(await getAccountDeviceId(store, 'b:supervisor:1'), first);
  assert.notEqual(first, store.meta.get('device_id'));
  await assert.rejects(getAccountDeviceId(store, ''), /حساب الجهاز/);
});

test('legacy device conflict retries the same saved session without changing another account or unrelated permission failure', async () => {
  const base = { deviceId: 'legacy-device', actorKey: 'a:supervisor:1', status: 'rejected_permission' };
  const store = fixture([
    { ...base, sessionId: 'saved', lastError: 'معرّف الجهاز مرتبط بحساب آخر.' },
    { ...base, sessionId: 'denied', lastError: 'لا تملك الصلاحية' },
    { ...base, sessionId: 'other', actorKey: 'a:supervisor:2' },
  ]);
  await migrateLegacyRecitationDevice(store, base.actorKey);
  assert.equal(store.updates.length, 1);
  const update = store.updates[0];
  assert.equal(update.sessionId, 'saved');
  assert.equal(update.patch.status, 'pending');
  assert.equal(update.patch.bootId, '');
  assert.equal(update.patch.nextRetryAt, null);
  assert.equal(Object.hasOwn(update.patch, 'tasks'), false);
  assert.equal(Object.hasOwn(update.patch, 'committedAtLocal'), false);
});
