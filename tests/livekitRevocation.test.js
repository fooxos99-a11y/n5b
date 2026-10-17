import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { TokenVerifier } from 'livekit-server-sdk';
import { disconnectLiveKitCallParticipant } from '../server/services/livekitCalls.js';

test('participant revocation is tenant-room bounded, idempotent for absence and fails visibly on provider outage', async t => {
  const saved = Object.fromEntries(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].map(key => [key, process.env[key]]));
  const requests = [];
  let fail = false;
  const key = 'local-revocation', secret = 'synthetic-revocation-secret-at-least-32-characters';
  const verifier = new TokenVerifier(key, secret);
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const claims = await verifier.verify(req.headers.authorization.replace(/^Bearer /, ''));
    requests.push({ path: req.url, body });
    assert.equal(claims.video.roomAdmin, true);
    assert.equal(claims.video.room, body.room);
    assert.equal(body.identity, 'reciter:8');
    assert.ok(Number(body.revokeTokenTs) >= Math.floor(Date.now() / 1000));
    res.setHeader('Content-Type', 'application/json');
    if (fail) { res.writeHead(503).end(JSON.stringify({ code: 'unavailable', msg: 'Synthetic outage' })); return; }
    if (body.room === 'tenant-room-absent') { res.writeHead(404).end(JSON.stringify({ code: 'not_found', msg: 'Missing' })); return; }
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  });
  process.env.LIVEKIT_URL = '';
  await disconnectLiveKitCallParticipant({ identity: 'reciter:8', roomNames: [] });
  await assert.rejects(disconnectLiveKitCallParticipant({ identity: 'reciter:8', roomNames: ['tenant-room-a'] }), error => error.statusCode === 503);
  Object.assign(process.env, { LIVEKIT_URL: `http://127.0.0.1:${server.address().port}`, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret });
  await disconnectLiveKitCallParticipant({ identity: 'reciter:8', roomNames: ['tenant-room-a', 'tenant-room-a', 'tenant-room-absent'] });
  assert.deepEqual(requests.map(item => item.body.room), ['tenant-room-a', 'tenant-room-absent']);
  assert.ok(requests.every(item => item.path === '/twirp/livekit.RoomService/RemoveParticipant'));
  await assert.rejects(disconnectLiveKitCallParticipant({ identity: 'other:8', roomNames: ['tenant-room-a'] }), error => error.statusCode === 422);
  fail = true;
  await assert.rejects(disconnectLiveKitCallParticipant({ identity: 'reciter:8', roomNames: ['tenant-room-a'] }), error => error.statusCode === 503);
});
