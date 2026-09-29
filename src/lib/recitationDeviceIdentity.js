import { createUuid } from '../../shared/offline-recitation.js';

const pendingDevices = new WeakMap();

export async function getAccountDeviceId(store, actorKey) {
  if (!actorKey) throw new Error('حساب الجهاز غير محدد.');
  let pending = pendingDevices.get(store);
  if (!pending) { pending = new Map(); pendingDevices.set(store, pending); }
  if (pending.has(actorKey)) return pending.get(actorKey);
  const operation = (async () => {
    const key = `device_id:${actorKey}`;
    let id = await store.getMeta(key);
    if (!id) { id = createUuid(); await store.setMeta(key, id); }
    return id;
  })().finally(() => pending.delete(actorKey));
  pending.set(actorKey, operation);
  return operation;
}

export async function migrateLegacyRecitationDevice(store, actorKey) {
  const legacyId = await store.getMeta('device_id');
  if (!legacyId) return;
  const sessions = await store.getSessions(actorKey, ['pending', 'failed', 'syncing', 'invalid_sequence', 'rejected_permission']);
  for (const session of sessions) {
    if (session.deviceId !== legacyId) continue;
    const deviceConflict = /معرّ?ف الجهاز مرتبط بحساب آخر/.test(session.lastError || '');
    if (session.status === 'rejected_permission' && !deviceConflict) continue;
    await store.updateSession(actorKey, session.sessionId, {
      deviceId: await getAccountDeviceId(store, actorKey),
      // A new device has no trusted clock anchor for this earlier event.
      bootId: '',
      ...(deviceConflict ? { status: 'pending', nextRetryAt: null, lastError: '' } : {}),
    });
  }
}
