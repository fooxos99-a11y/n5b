import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import webhookRouter from '../server/routes/livekitWebhookRoutes.js';
import { subscribeLiveKitPresence } from '../server/services/livekitPresenceEvents.js';

test('LiveKit webhook authenticates the raw body and only dispatches verified presence events', async t => {
  const keys = { LIVEKIT_URL: 'wss://calls.example.test', LIVEKIT_API_KEY: 'test-webhook-key', LIVEKIT_API_SECRET: 'test-webhook-secret-at-least-32-characters' };
  const saved = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));
  Object.assign(process.env, keys);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const received = [];
  t.after(subscribeLiveKitPresence(room => received.push(room)));
  const app = express();
  app.use('/webhook', webhookRouter);
  app.use(express.json());
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: 'Rejected payload' }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const body = event => JSON.stringify({ event, id: randomUUID(), createdAt: Math.floor(Date.now() / 1000), room: { name: 'غرفة اختبار' } }, null, 2) + '\n';
  const sign = async (payload, overrides = {}) => {
    const token = new AccessToken(overrides.key || keys.LIVEKIT_API_KEY, overrides.secret || keys.LIVEKIT_API_SECRET, { ttl: overrides.ttl || '1m' });
    token.sha256 = createHash('sha256').update(payload).digest('base64');
    return token.toJwt();
  };
  const post = async (payload, authorization, contentType = 'application/webhook+json') => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType, ...(authorization ? { Authorization: authorization } : {}) }, body: payload });
    await response.arrayBuffer();
    return response.status;
  };
  const joined = body('participant_joined');
  const jwt = await sign(joined);
  assert.equal(await post(joined), 401);
  assert.equal(await post(joined, 'invalid'), 401);
  assert.equal(await post(joined + ' ', jwt), 401);
  assert.equal(await post(joined, await sign(joined, { key: 'another-key' })), 401);
  assert.equal(await post(joined, await sign(joined, { secret: 'another-secret-at-least-32-characters' })), 401);
  assert.equal(await post(joined, await sign(joined, { ttl: -60 })), 401);
  assert.equal(await post(joined, jwt, 'application/json'), 415);
  assert.equal(await post('x'.repeat(65537), jwt), 413);
  assert.deepEqual(received, []);
  process.env.LIVEKIT_URL = '';
  assert.equal(await post(joined, jwt), 503);
  assert.deepEqual(received, []);
  process.env.LIVEKIT_URL = keys.LIVEKIT_URL;
  assert.equal(await post(joined, jwt, 'application/webhook+json; charset=utf-8'), 204);
  for (const event of ['participant_left', 'participant_connection_aborted', 'room_started', 'room_finished']) {
    const payload = body(event);
    assert.equal(await post(payload, await sign(payload)), 204);
  }
  assert.deepEqual(received, Array(5).fill('غرفة اختبار'));
  const track = body('track_published');
  assert.equal(await post(track, await sign(track)), 204);
  assert.equal(received.length, 5);
  // Retried delivery invalidates current presence rather than applying a counter twice.
  assert.equal(await post(joined, jwt), 204);
  assert.equal(received.length, 6);
});
