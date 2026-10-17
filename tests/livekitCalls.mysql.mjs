import livekitWebhookRouter from '../server/routes/livekitWebhookRoutes.js';
import '../server/loadEnvironment.js';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { setTimeout, clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import mysql from 'mysql2/promise';
import { TokenVerifier, AccessToken } from 'livekit-server-sdk';
import { initDatabase, runWithDatabase } from '../server/db.js';
import callRouter from '../server/routes/callRoutes.js';
import { invalidateLiveKitPresence } from '../server/services/livekitCalls.js';
import { CALL_ARCHIVE_CONSENT_VERSION } from '../server/services/callArchiveConfig.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
assert.notEqual(Number(process.env.MYSQL_PORT), 3312, 'protected database must never be used');
const database = `nukhab_calls_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const temporary = await mkdtemp(path.join(tmpdir(), 'nukhab-call-consent-'));
const saved = Object.fromEntries(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'CALL_ARCHIVE_ENABLED', 'CALL_ARCHIVE_STORAGE_PATH'].map(key => [key, process.env[key]]));
let pool, server, mediaServer, rejectClose = false, rejectPresence = false, closedRoom, activePeople = new Map(), streamController;
const listen = app => new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
try {
  process.env.CALL_ARCHIVE_ENABLED = 'false';
  pool = await initDatabase(database, { seedDefaultData: false });
  await pool.query("INSERT INTO committees (id,name) VALUES (1,'Calls one'),(2,'Calls two')");
  await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title,role) VALUES (7,'Test','calls-teacher','','','','admin')");
  await pool.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (7,1)');
  await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (3,'Test','calls-one','','',1),(4,'Test','calls-two','','',2)");
  Object.assign(process.env, { LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-with-at-least-32-characters' });
  const verifier = new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  const media = express();
  media.use(express.json());
  media.post('/twirp/livekit.RoomService/ListRooms', async (req, res) => {
    const claims = await verifier.verify(req.get('authorization').replace(/^Bearer /, ''));
    assert.equal(claims.video.roomList, true);
    if (rejectPresence) return res.status(503).json({ code: 'unavailable', msg: 'Presence unavailable' });
    return res.json({ rooms: [...activePeople.keys()].map(name => ({ name })) });
  });
  media.post('/twirp/livekit.RoomService/ListParticipants', async (req, res) => {
    const claims = await verifier.verify(req.get('authorization').replace(/^Bearer /, ''));
    assert.equal(claims.video.roomAdmin, true);
    assert.equal(claims.video.room, req.body.room);
    return res.json({ participants: activePeople.get(req.body.room) || [] });
  });
  media.post('/twirp/livekit.RoomService/DeleteRoom', async (req, res) => {
    const claims = await verifier.verify(req.get('authorization').replace(/^Bearer /, ''));
    assert.equal(claims.video.roomCreate, true);
    if (rejectClose) return res.status(503).json({ code: 'unavailable', msg: 'Test unavailable' });
    closedRoom = req.body.room;
    return res.json({});
  });
  mediaServer = await listen(media);
  process.env.LIVEKIT_URL = `http://127.0.0.1:${mediaServer.address().port}`;
  const app = express();
  app.use('/livekit-webhook', livekitWebhookRouter);
  app.use(express.json());
  app.use((req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return res.status(401).json({ message: 'Test authentication required' });
    req.auth = { role, id: Number(req.get('x-test-id')), name: 'Test', ...(req.get('x-test-token-hash') ? {tokenHash:req.get('x-test-token-hash')} : {}) };
    return runWithDatabase(database, {}, next);
  });
  app.use('/calls', callRouter);
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(error.statusCode || error.status || 500).json({ message: error.message });
  });
  server = await listen(app);
  const request = async (path, { role = 'manager', id = 1, body, method = 'POST' } = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/calls${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role, 'x-test-id': String(id) } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('', { role: null, method: 'GET' })).status, 401);
  assert.equal((await request('', { role: 'student', id: 3, body: { name: 'Forbidden', committeeId: 1 } })).status, 403);
  assert.equal((await request('', { role: 'supervisor', id: 7, body: { name: 'Forbidden', committeeId: 2 } })).status, 403);
  const created = await request('', { body: { name: 'Test room', committeeId: 1 } });
  assert.equal(created.status, 201);
  const roomId = created.body.id;
  assert.equal((await request(`/${roomId}/token`, { role: 'student', id: 4 })).status, 403);
  const joined = await request(`/${roomId}/token`, { role: 'student', id: 3 });
  assert.equal(joined.status, 200);
  const claims = await verifier.verify(joined.body.token);
  assert.equal(claims.sub, 'student:3');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.roomAdmin, undefined);
  const roomName = claims.video.room;
  assert.equal((await request(`/${roomId}/close`, { role: 'student', id: 3 })).status, 403);
  assert.equal((await request(`/${roomId}/leave`, { role: 'student', id: 3 })).status, 200);
  const [[afterLeave]] = await pool.query('SELECT status FROM call_rooms WHERE id=?', [roomId]);
  assert.equal(afterLeave.status, 'open', 'leaving must never close the permanent room');
  const afterLeaveDirectory = await request('', { role: 'student', id: 3, method: 'GET' });
  assert.deepEqual(afterLeaveDirectory.body.rooms.map(room => room.id), [roomId]);
  const rejoined = await request(`/${roomId}/token`, { role: 'student', id: 3 });
  assert.equal(rejoined.status, 200);
  assert.equal((await verifier.verify(rejoined.body.token)).video.room, roomName);
  rejectPresence = true;
  invalidateLiveKitPresence(roomName);
  const unavailablePresence = await request('', { role: 'student', id: 3, method: 'GET' });
  assert.equal(unavailablePresence.status, 200, 'media outage must not hide persistent rooms');
  assert.deepEqual(unavailablePresence.body.rooms.map(room => room.id), [roomId]);
  assert.equal(unavailablePresence.body.rooms[0].presenceAvailable, false);
  assert.equal(unavailablePresence.body.presenceUnavailable, true);
  rejectPresence = false;
  invalidateLiveKitPresence(roomName);
  assert.equal((await request(`/${roomId}/close`, { role: 'supervisor', id: 7 })).status, 403);
  process.env.LIVEKIT_URL = '';
  assert.equal((await request(`/${roomId}/token`, { role: 'supervisor', id: 7 })).status, 503);
  const [[participants]] = await pool.query('SELECT COUNT(*) AS count FROM call_room_participants WHERE room_id=?', [roomId]);
  assert.equal(Number(participants.count), 1);
  process.env.LIVEKIT_URL = `http://127.0.0.1:${mediaServer.address().port}`;
  rejectClose = true;
  assert.equal((await request(`/${roomId}/close`)).status, 503);
  const [[stillOpen]] = await pool.query('SELECT status FROM call_rooms WHERE id=?', [roomId]);
  assert.equal(stillOpen.status, 'open');
  rejectClose = false;
  assert.equal((await request(`/${roomId}/close`)).status, 200);
  assert.equal(closedRoom, roomName);
  assert.equal((await request(`/${roomId}/token`, { role: 'student', id: 3 })).status, 404);
  assert.equal((await request(`/${roomId}/close`)).status, 200);
  const other = await request('', { body: { name: 'Other circle', committeeId: 2 } });
  const general = await request('', { body: { name: 'General room' } });
  assert.equal(other.status, 201); assert.equal(general.status, 201);
  const visible = await request('', { role: 'supervisor', id: 7, method: 'GET' });
  assert.deepEqual(visible.body.rooms.map(room => room.id), [general.body.id]);
  assert.equal((await request(`/${general.body.id}/token`, { role: 'student', id: 3 })).status, 200);
  // Issuing an admission token does not mean that the student joined the media room.
  const directory = await request('', { role: 'supervisor', id: 7, method: 'GET' });
  assert.deepEqual(directory.body.rooms[0].participants, []);
  assert.equal(directory.body.rooms[0].studentPresent, false);
  assert.equal(Object.hasOwn(directory.body.rooms[0], 'participantCount'), false);
  const [[mediaRoom]] = await pool.query('SELECT livekit_room_name AS name FROM call_rooms WHERE id=?', [general.body.id]);
  activePeople.set(mediaRoom.name, [{ identity: 'supervisor:7', name: 'مشرف اختبار', kind: 0 },
    { identity: 'egress-recorder', name: 'Recorder bot', kind: 1 },
    { identity: 'guest:99', name: 'Unknown identity', kind: 0 }]);
  streamController = new globalThis.AbortController();
  const stream = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/calls/events`, {
    headers: { 'x-test-role': 'supervisor', 'x-test-id': '7' }, signal: streamController.signal,
  });
  assert.equal(stream.headers.get('content-type').startsWith('text/event-stream'), true);
  assert.equal(stream.headers.get('cache-control'), 'private, no-store, no-cache, no-transform');
  assert.equal(stream.headers.get('x-accel-buffering'), 'no');
  assert.equal(stream.headers.get('content-encoding'), null);
  const reader = stream.body.getReader(); let pending = '';
  const nextSnapshot = async () => {
    let timer;
    try {
      return await Promise.race([(async () => {
        for (;;) {
          const boundary = pending.indexOf('\n\n');
          if (boundary >= 0) {
            const event = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            if (event.startsWith('data:')) return JSON.parse(event.slice(5));
            continue;
          }
          const chunk = await reader.read(); assert.equal(chunk.done, false);
          pending += new TextDecoder().decode(chunk.value);
        }
      })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No live snapshot within eight seconds')), 8000); })]);
    } finally { clearTimeout(timer); }
  };
  let staffOnly = await nextSnapshot();
  if (!staffOnly.rooms[0].participants.length) staffOnly = await nextSnapshot();
  assert.deepEqual(staffOnly.rooms.map(room => room.id), [general.body.id]);
  assert.equal(staffOnly.rooms[0].studentPresent, false);
  assert.deepEqual(staffOnly.rooms[0].participants.map(person => person.name), ['مشرف اختبار']);
  activePeople.set(mediaRoom.name, [{ identity: 'supervisor:7', name: 'مشرف اختبار' }, { identity: 'student:3', name: 'طالب اختبار' }]);
  const webhookBody=JSON.stringify({event:'participant_joined',id:randomUUID(),createdAt:Math.floor(Date.now()/1000),room:{name:mediaRoom.name}});
  const webhookToken=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{ttl:'1m'});
  webhookToken.sha256=createHash('sha256').update(webhookBody).digest('base64');
  const webhookJwt=await webhookToken.toJwt();
  const webhookUrl=`http://127.0.0.1:${server.address().port}/livekit-webhook`;
  assert.equal((await globalThis.fetch(webhookUrl,{method:'POST',headers:{'content-type':'application/webhook+json'},body:webhookBody})).status,401);
  assert.equal((await globalThis.fetch(webhookUrl,{method:'POST',headers:{'content-type':'application/webhook+json',Authorization:webhookJwt},body:webhookBody+' '})).status,401);
  const pushedAt=Date.now();
  assert.equal((await globalThis.fetch(webhookUrl,{method:'POST',headers:{'content-type':'application/webhook+json',Authorization:webhookJwt},body:webhookBody})).status,204);
  const studentEntered = await nextSnapshot();
  assert.ok(Date.now()-pushedAt<1500,'a verified event pushes the directory before its polling interval');
  assert.equal(studentEntered.rooms[0].studentPresent, true);
  assert.deepEqual(studentEntered.rooms[0].participants.map(person => person.name), ['مشرف اختبار', 'طالب اختبار']);
  activePeople.set(mediaRoom.name, []);
  const leaveBody = JSON.stringify({ event: 'participant_left', id: randomUUID(), createdAt: Math.floor(Date.now() / 1000), room: { name: mediaRoom.name } });
  const leaveToken = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { ttl: '1m' });
  leaveToken.sha256 = createHash('sha256').update(leaveBody).digest('base64');
  const leftAt = Date.now();
  assert.equal((await globalThis.fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/webhook+json', Authorization: await leaveToken.toJwt() }, body: leaveBody })).status, 204);
  const everyoneLeft = await nextSnapshot();
  assert.ok(Date.now() - leftAt < 1500, 'a verified leave event pushes the directory before its polling interval');
  assert.equal(everyoneLeft.rooms[0].studentPresent, false);
  assert.deepEqual(everyoneLeft.rooms[0].participants, []);
  streamController.abort(); await reader.cancel().catch(() => {});
  activePeople.delete(mediaRoom.name);
  invalidateLiveKitPresence(mediaRoom.name);
  const afterMediaEnded = await request('', { role: 'student', id: 3, method: 'GET' });
  assert.deepEqual(afterMediaEnded.body.rooms.map(room => room.id), [general.body.id]);
  assert.equal(afterMediaEnded.body.rooms[0].presenceAvailable, true);
  assert.deepEqual(afterMediaEnded.body.rooms[0].participants, []);
  const freshAdmission = await request(`/${general.body.id}/token`, { role: 'student', id: 3 });
  assert.equal(freshAdmission.status, 200, 'a room without a media session must accept a fresh admission');
  assert.equal((await verifier.verify(freshAdmission.body.token)).video.room, mediaRoom.name);
  assert.equal((await request('', { role: 'admin', id: 7, method: 'GET' })).status, 403);
  await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title,role) VALUES (8,'Reciter','calls-reciter','','','','reciter')");
  await pool.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (8,1)');
  assert.equal((await request('', { role: 'reciter', id: 8, method: 'GET' })).status, 200);
  const reciterGeneral = await request('', { role: 'reciter', id: 8, body: { name: 'Reciter general' } });
  assert.equal(reciterGeneral.status, 201);
  const reciterScoped = await request('', { role: 'reciter', id: 8, body: { name: 'Reciter scope', committeeId: 1 } });
  assert.equal(reciterScoped.status, 201);
  assert.equal((await request('', { role: 'reciter', id: 8, body: { name: 'Forbidden scope', committeeId: 2 } })).status, 403);
  assert.equal((await request(`/${other.body.id}/token`, { role: 'reciter', id: 8 })).status, 403);
  assert.equal((await request(`/${general.body.id}/close`, { role: 'reciter', id: 8 })).status, 403);
  assert.equal((await request(`/${reciterGeneral.body.id}/token`, { role: 'reciter', id: 8 })).status, 200);
  assert.equal((await request(`/${reciterGeneral.body.id}/close`, { role: 'reciter', id: 8 })).status, 200);
  assert.equal((await request(`/${general.body.id}/token`, { role: 'admin', id: 7 })).status, 403);
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'calls')");
  assert.equal((await request('', { role: 'admin', id: 7, method: 'GET' })).status, 200);
  const watch = async (role,id,tokenHash) => {
    streamController = new globalThis.AbortController();
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/calls/events`, {
      headers:{'x-test-role':role,'x-test-id':String(id),...(tokenHash?{'x-test-token-hash':tokenHash}:{})}, signal:streamController.signal,
    });
    assert.equal(response.status,200);
    const reader=response.body.getReader();
    assert.equal((await reader.read()).done,false);
    return reader;
  };
  const expectClosed = async reader => {
    let timer;
    try { await Promise.race([(async()=>{while(!(await reader.read()).done){ /* Drain the final in-flight snapshot. */ }})(),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Revoked stream stayed open')),8000);})]);
    } finally { clearTimeout(timer);streamController.abort();await reader.cancel().catch(()=>{}); }
  };
  const revokedGrantReader=await watch('admin',7);
  await pool.query('DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id=7');
  await expectClosed(revokedGrantReader);
  await pool.query("INSERT INTO auth_sessions(token_hash,user_role,user_id,user_name) VALUES('test-live-session','student',3,'Test')");
  const revokedSessionReader=await watch('student',3,'test-live-session');
  await pool.query("DELETE FROM auth_sessions WHERE token_hash='test-live-session'");
  await expectClosed(revokedSessionReader);
  assert.equal((await request('', { role: 'admin', id: 7, method: 'GET' })).status, 403);
  Object.assign(process.env, { CALL_ARCHIVE_ENABLED: 'true', CALL_ARCHIVE_STORAGE_PATH: temporary });
  const [[beforeConsent]] = await pool.query("SELECT join_count AS joins FROM call_room_participants WHERE room_id=? AND user_role='student' AND user_id=3", [general.body.id]);
  const consentDenied = await request(`/${general.body.id}/token`, { role: 'student', id: 3 });
  assert.equal(consentDenied.status, 422);
  assert.equal(consentDenied.body.code, 'recording_consent_required');
  assert.equal(consentDenied.body.recordingConsentRequired, true);
  assert.equal(Object.hasOwn(consentDenied.body, 'token'), false);
  const [[afterConsentDenied]] = await pool.query("SELECT join_count AS joins FROM call_room_participants WHERE room_id=? AND user_role='student' AND user_id=3", [general.body.id]);
  assert.equal(afterConsentDenied.joins, beforeConsent.joins, 'denied consent cannot mutate admission history');
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_consents'))[0][0].count), 0);
  const consentAccepted = await request(`/${general.body.id}/token`, { role: 'student', id: 3, body: { recordingConsent: true } });
  assert.equal(consentAccepted.status, 200);
  assert.equal((await verifier.verify(consentAccepted.body.token)).sub, 'student:3');
  assert.equal(consentAccepted.body.recording.consentRequired, true);
  const [[storedConsent]] = await pool.query("SELECT consent_version AS version FROM call_archive_consents WHERE room_id=? AND identity='student:3'", [general.body.id]);
  assert.equal(storedConsent.version, CALL_ARCHIVE_CONSENT_VERSION);
  assert.equal((await request('/999999/token', { role: 'student', id: 3, body: { recordingConsent: true } })).status, 404);
  assert.equal((await request(`/${other.body.id}/token`, { role: 'student', id: 3, body: { recordingConsent: true } })).status, 403);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_consents'))[0][0].count), 1, 'missing or unauthorized rooms cannot receive consent records');
  globalThis.console.log('Isolated MySQL/HTTP passed: durable empty rooms after leave/media expiry and fresh admission, presence outage fallback, student close denial, reciter scope/ownership, signed admission, explicit close recovery, live snapshots and grant/session revocation; integrated consent POST rejects before token/history, accepts and stores version, rejects missing/unauthorized rooms without consent writes.');
} finally {
  streamController?.abort();
  for (const listener of [server, mediaServer]) await new Promise(resolve => listener ? listener.close(resolve) : resolve());
  await pool?.end();
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try {
    const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
    try { assert.match(database, /^nukhab_calls_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
    finally { await connection.end(); }
  } finally {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(temporary).startsWith('nukhab-call-consent-'));
    await rm(temporary, { recursive: true, force: true });
  }
}
