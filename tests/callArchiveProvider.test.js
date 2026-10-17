import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { TokenVerifier } from 'livekit-server-sdk';
import { createCallArchiveProvider } from '../server/services/callArchiveProvider.js';

test('installed LiveKit SDK serializes audio-only mixed/track capture and private S3 output against authenticated HTTP stub', async () => {
  const app = express(); app.use(express.json());
  const verifier = new TokenVerifier('sdk-test-key', 'sdk-test-secret-with-at-least-32-characters');
  const requests = [];
  app.use(async (req, res, next) => {
    try { const claims = await verifier.verify(req.get('authorization').replace(/^Bearer /, '')); req.testClaims = claims; next(); }
    catch (error) { res.status(401).json({ message: error.message }); }
  });
  for (const method of ['StartRoomCompositeEgress', 'StartTrackCompositeEgress']) {
    app.post(`/twirp/livekit.Egress/${method}`, (req, res) => {
      assert.equal(req.testClaims.video.roomRecord, true);
      assert.equal(req.body.roomName, 'sdk-room');
      const output = req.body.fileOutputs?.[0] || req.body.file;
      assert.ok(output); assert.equal(output.fileType, 'MP4'); assert.equal(output.disableManifest, true);
      if (method === 'StartRoomCompositeEgress') assert.equal(req.body.audioOnly, true);
      else { assert.equal(req.body.audioTrackId, 'TR_microphone'); assert.ok(!req.body.videoTrackId); }
      requests.push({ method, output });
      res.json({ egressId: `EG_${requests.length}`, status: 'EGRESS_ACTIVE', roomName: 'sdk-room' });
    });
  }
  app.post('/twirp/livekit.Egress/ListEgress', (req, res) => { assert.equal(req.testClaims.video.roomRecord, true); res.json({items:[]}); });
  app.post('/twirp/livekit.Egress/StopEgress', (req, res) => { assert.equal(req.testClaims.video.roomRecord, true); res.json({egressId:req.body.egressId,status:'EGRESS_COMPLETE'}); });
  app.post('/twirp/livekit.RoomService/ListParticipants', (req, res) => {
    assert.equal(req.testClaims.video.roomAdmin,true);
    res.json({participants:[{identity:'student:3',name:'Student',kind:'STANDARD',tracks:[{sid:'TR_microphone',type:'AUDIO'}]},
      {identity:'reciter:7',name:'Reciter',kind:'STANDARD'}, {identity:'reciter:99',kind:'EGRESS'}]});
  });
  const server = await new Promise(resolve => {const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  try {
    const livekit={serviceUrl:`http://127.0.0.1:${server.address().port}`,apiKey:'sdk-test-key',apiSecret:'sdk-test-secret-with-at-least-32-characters'};
    const local=createCallArchiveProvider({configured:true,storage:'local',egressPath:'/recordings/private',livekit});
    const key=`${'a'.repeat(20)}/call-archives/${'b'.repeat(36)}/${'c'.repeat(36)}.mp4`;
    assert.equal((await local.start('sdk-room',{kind:'mixed',object_key:key})).egressId,'EG_1');
    await local.start('sdk-room',{kind:'participant',object_key:key,track_id:'TR_microphone'});
    assert.equal(requests[0].output.filepath,`/recordings/private/${key}`);
    assert.equal(requests[0].output.filepath.includes('\\'),false);
    const s3=createCallArchiveProvider({configured:true,storage:'s3',livekit,s3:{bucket:'private-test',region:'auto',endpoint:'https://example.invalid',accessKey:'mock-key',secret:'mock-secret',forcePathStyle:true}});
    await s3.start('sdk-room',{kind:'mixed',object_key:key});
    assert.equal(requests[2].output.filepath,key); assert.equal(requests[2].output.s3.bucket,'private-test');
    assert.equal(requests[2].output.s3.forcePathStyle,true);
    const humans=await local.presence('sdk-room'); assert.equal(humans.length,2); assert.deepEqual(humans[0].tracks,['TR_microphone']);
    assert.deepEqual(await local.list('sdk-room'),[]); assert.equal((await local.stop('EG_1')).status,3);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
