import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import { TokenVerifier } from 'livekit-server-sdk';
import { resolveLiveKitConfig } from '../server/services/livekitConfig.js';
import { createLiveKitCallToken, closeLiveKitCallRoom } from '../server/services/livekitCalls.js';

const keys = { LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters' };
test('self-hosted endpoints normalize HTTPS and WSS without sending secrets to the browser', () => {
  const config = resolveLiveKitConfig({ ...keys, LIVEKIT_URL: 'https://calls.example.test/' });
  assert.equal(config.serverUrl, 'wss://calls.example.test');
  assert.equal(config.serviceUrl, 'https://calls.example.test');
  assert.equal(resolveLiveKitConfig({ ...keys, LIVEKIT_URL: 'wss://calls.example.test/' }).serviceUrl, 'https://calls.example.test');
  assert.equal(resolveLiveKitConfig({ ...keys, LIVEKIT_URL: 'ws://127.0.0.1:7880' }).serviceUrl, 'http://127.0.0.1:7880');
});
test('insecure public URLs, embedded credentials, malformed and incomplete configurations fail closed', () => {
  for (const url of ['', 'invalid', 'http://calls.example.test', 'ws://calls.example.test', 'ftp://localhost', 'wss://key:secret@calls.example.test', 'wss://calls.example.test?token=secret', 'wss://calls.example.test#secret']) {
    assert.equal(resolveLiveKitConfig({ ...keys, LIVEKIT_URL: url }), null);
  }
  assert.equal(resolveLiveKitConfig({ LIVEKIT_URL: 'wss://calls.example.test' }), null);
});
test('admission tokens are signed for one room and expire shortly without imposing a call timer', async () => {
  const saved = Object.fromEntries(['LIVEKIT_URL', ...Object.keys(keys)].map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, keys, { LIVEKIT_URL: 'wss://calls.example.test' });
    const response = await createLiveKitCallToken({ roomName: 'test-room', identity: 'student:3', name: 'Test' });
    assert.deepEqual(Object.keys(response).sort(), ['serverUrl', 'token']);
    const claims = await new TokenVerifier(keys.LIVEKIT_API_KEY, keys.LIVEKIT_API_SECRET).verify(response.token);
    assert.equal(claims.video.room, 'test-room');
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.roomAdmin, undefined);
    assert.equal(claims.exp - claims.nbf, 300);
    process.env.LIVEKIT_URL = '';
    await assert.rejects(createLiveKitCallToken({ roomName: 'test-room', identity: 'student:3' }), { statusCode: 503 });
    await assert.rejects(closeLiveKitCallRoom('test-room'), { statusCode: 503 });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
