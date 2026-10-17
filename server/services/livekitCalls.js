import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { requireLiveKitConfig, resolveLiveKitConfig } from './livekitConfig.js';
import { notifyLiveKitPresence } from './livekitPresenceEvents.js';

export const isLiveKitConfigured = () => Boolean(resolveLiveKitConfig());

export async function createLiveKitCallToken({ roomName, identity, name, metadata }) {
  const config = requireLiveKitConfig();
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata: JSON.stringify(metadata || {}),
    // This limits initial admission, not call duration. LiveKit refreshes connected clients.
    ttl: '5m',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return { token: await token.toJwt(), serverUrl: config.serverUrl };
}

export async function closeLiveKitCallRoom(roomName) {
  const config = requireLiveKitConfig();
  const client = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 15 });
  try {
    await client.deleteRoom(roomName);
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error?.message || ''))) throw error;
  }
}

/** Room names must be selected from the current tenant's SQL records by the caller. */
export async function disconnectLiveKitCallParticipant({ identity, roomNames }) {
  if (!/^(student|supervisor|admin|manager|reciter):[1-9][0-9]*$/.test(String(identity || ''))
    || !Array.isArray(roomNames) || roomNames.some(name => typeof name !== 'string' || !name || name.length > 180)) {
    throw Object.assign(new Error('بيانات فصل المشارك غير صالحة.'), { statusCode: 422 });
  }
  const names = [...new Set(roomNames)];
  if (!names.length) return;
  const config = requireLiveKitConfig();
  const client = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 10 });
  const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 1);
  for (const roomName of names) {
    try {
      await client.removeParticipant(roomName, identity, { revokeTokenTs });
    } catch (error) {
      if (error.code !== 'not_found' && !/not found|does not exist/i.test(String(error?.message || ''))) {
        throw Object.assign(new Error('تعذر فصل الحساب عن المكالمات. لم تُحفظ تغييرات الحساب؛ أعد المحاولة.'), { statusCode: 503, cause: error });
      }
    }
    invalidateLiveKitPresence(roomName);
  }
}

// Short shared snapshots avoid multiplying media requests for each directory viewer.
let mediaScope = '', roomsSnapshot = null;
const participantSnapshots = new Map();
export function invalidateLiveKitPresence(roomName) {
  roomsSnapshot = null;
  if (roomName) participantSnapshots.delete(roomName);
  else participantSnapshots.clear();
  notifyLiveKitPresence(roomName);
}
const snapshot = (load) => ({ expires: Date.now() + 1000, value: Promise.resolve().then(load) });

/** Read the media server, never token issuance or the historical SQL join log. */
export async function listLiveKitParticipants(roomName) {
  const config = requireLiveKitConfig();
  const scope = JSON.stringify([config.serviceUrl, config.apiKey, config.apiSecret]);
  if (scope !== mediaScope) { mediaScope = scope; roomsSnapshot = null; participantSnapshots.clear(); }
  const client = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 5 });
  try {
    if (!roomsSnapshot || roomsSnapshot.expires <= Date.now()) {
      roomsSnapshot = snapshot(async () => new Set((await client.listRooms()).map(room => room.name)));
    }
    const active = await roomsSnapshot.value;
    if (!active.has(roomName)) return [];
    for (const [name, entry] of participantSnapshots) if (entry.expires <= Date.now()) participantSnapshots.delete(name);
    if (!participantSnapshots.has(roomName)) {
      participantSnapshots.set(roomName, snapshot(async () => (await client.listParticipants(roomName))
        .filter(person => (person.kind === undefined || Number(person.kind) === 0) && /^(student|supervisor|admin|manager|reciter):[0-9]+$/.test(person.identity))
        .map(person => ({
        identity: person.identity,
        name: person.name || 'مستخدم',
        role: /^(student|supervisor|admin|manager|reciter):[0-9]+$/.exec(person.identity)?.[1] || 'unknown',
      }))));
    }
    return await participantSnapshots.get(roomName).value;
  } catch (error) {
    if (error.code === 'not_found' || /not found|does not exist/i.test(String(error?.message || ''))) return [];
    throw Object.assign(new Error('تعذر تحديث الموجودين داخل المكالمات.'), { statusCode: 503, cause: error });
  }
}
