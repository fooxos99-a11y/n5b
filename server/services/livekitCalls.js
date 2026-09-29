import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

const getConfig = () => ({
  url: String(process.env.LIVEKIT_URL || '').trim(),
  apiKey: String(process.env.LIVEKIT_API_KEY || '').trim(),
  apiSecret: String(process.env.LIVEKIT_API_SECRET || '').trim(),
});

export const isLiveKitConfigured = () => Object.values(getConfig()).every(Boolean);

export async function createLiveKitCallToken({ roomName, identity, name, metadata }) {
  const config = getConfig();
  if (!isLiveKitConfigured()) {
    const error = new Error('خدمة المكالمات غير مهيأة حالياً.');
    error.statusCode = 503;
    throw error;
  }
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata: JSON.stringify(metadata || {}),
    ttl: '15m',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return { token: await token.toJwt(), serverUrl: config.url };
}

export async function closeLiveKitCallRoom(roomName) {
  if (!isLiveKitConfigured()) return;
  const config = getConfig();
  const client = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
  try {
    await client.deleteRoom(roomName);
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error?.message || ''))) throw error;
  }
}
