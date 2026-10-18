import '../server/loadEnvironment.js';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import mysql from 'mysql2/promise';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { createCallArchiveWebhookDispatcher } from '../server/services/callArchiveWebhookDispatch.js';
import { createLivekitWebhookRouter } from '../server/routes/livekitWebhookRoutes.js';

assert.ok(['127.0.0.1','localhost'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE,'nukhab_local');
const databases=[0,1].map(()=>`nukhab_hook_${randomUUID().replaceAll('-','').slice(0,16)}`);
const temporary=await mkdtemp(path.join(tmpdir(),'nukhab-webhook-test-'));
const keys=['CALL_ARCHIVE_ENABLED','CALL_ARCHIVE_STORAGE_PATH','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'];
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{CALL_ARCHIVE_ENABLED:'true',CALL_ARCHIVE_STORAGE_PATH:temporary,LIVEKIT_API_KEY:'webhook-test-key',LIVEKIT_API_SECRET:'webhook-test-secret-at-least-32-characters'});
const pools=[];let server,mediaServer;
const listen=app=>new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
try {
  for(const database of databases) pools.push(await initDatabase(database,{seedDefaultData:false}));
  const roomNames=['signed-tenant-a','signed-tenant-b'];
  for(let index=0;index<databases.length;index++){
    await pools[index].query("INSERT INTO committees(id,name)VALUES(1,'Isolated circle')");
    await pools[index].query("INSERT INTO call_rooms(id,name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name)VALUES(1,'Same numeric ID',?,1,'supervisor',7,'Teacher')",[roomNames[index]]);
  }
  const media=express();media.use(express.json());
  const verifier=new TokenVerifier(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET);
  media.post('/twirp/livekit.RoomService/ListParticipants',async(req,res)=>{
    const claims=await verifier.verify(req.get('authorization').replace(/^Bearer /,''));
    assert.equal(claims.video.roomAdmin,true);assert.equal(req.body.room,'signed-tenant-b');
    res.json({participants:[{identity:'supervisor:7',name:'Teacher',kind:'STANDARD',tracks:[{sid:'TR_B1',type:'AUDIO'}]},
      {identity:'student:3',name:'Student',kind:'STANDARD',tracks:[{sid:'TR_B2',type:'AUDIO'}]}]});
  });
  media.post('/twirp/livekit.Egress/ListEgress',(req,res)=>{assert.equal(req.body.roomName,'signed-tenant-b');res.json({items:[]});});
  mediaServer=await listen(media);process.env.LIVEKIT_URL=`http://127.0.0.1:${mediaServer.address().port}`;
  const contexts=databases.map((databaseName,index)=>({databaseName,registrationNumber:String(100+index)}));
  let registryFailure=false;
  const dispatch=createCallArchiveWebhookDispatcher({forEachTenant:async callback=>{
    if(registryFailure)throw new Error('Mock active registry unavailable');
    for(const context of contexts)await runWithDatabase(context.databaseName,{tenant:context},callback);
  }});
  // Deliberately mounted WITHOUT any tenant middleware, exactly like index.js.
  const app=express();app.use('/webhook',createLivekitWebhookRouter({dispatchArchiveEvent:dispatch}));
  server=await listen(app);
  const send=async(payload,{invalidSignature=false}={})=>{
    const body=JSON.stringify({id:randomUUID(),createdAt:Math.floor(Date.now()/1000),...payload});
    const token=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{ttl:'1m'});
    token.sha256=createHash('sha256').update(invalidSignature?'tampered':body).digest('base64');
    return globalThis.fetch(`http://127.0.0.1:${server.address().port}/webhook`,{method:'POST',headers:{'Content-Type':'application/webhook+json',Authorization:await token.toJwt()},body});
  };
  const joined={event:'participant_joined',room:{name:'signed-tenant-b'},participant:{identity:'student:3'}};
  assert.equal((await send(joined)).status,204);
  assert.equal(Number((await pools[0].query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),0,'Wrong tenant with same numeric room ID receives no session');
  assert.equal(Number((await pools[0].query('SELECT COUNT(*) AS count FROM call_archive_media'))[0][0].count),0,'No wrong-tenant media artifacts');
  assert.equal(Number((await pools[1].query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),1);
  assert.equal(Number((await pools[1].query('SELECT COUNT(*) AS count FROM call_archive_media'))[0][0].count),3);
  assert.equal((await send(joined)).status,204,'Signed duplicate delivery remains idempotent');
  const [[session]]=await pools[1].query('SELECT * FROM call_archive_sessions LIMIT 1');
  await pools[1].query("UPDATE call_archive_media SET egress_id='EG_tenant_b',state='starting' WHERE session_id=? AND kind='mixed'",[session.id]);
  assert.equal((await send({event:'egress_updated',egressInfo:{egressId:'EG_tenant_b',roomName:'signed-tenant-b',status:'EGRESS_ACTIVE'}})).status,204,'Egress without event.room resolves by egressInfo');
  assert.equal((await pools[1].query('SELECT state FROM call_archive_sessions WHERE id=?',[session.id]))[0][0].state,'recording');
  assert.equal((await send(joined,{invalidSignature:true})).status,401);
  registryFailure=true;assert.equal((await send(joined)).status,503,'Processing/registry failure must request retry, not report invalid signature');registryFailure=false;
  assert.equal((await send({event:'participant_joined',room:{name:'unrelated-provider-room'}})).status,204);
  await pools[0].query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name)VALUES('Ambiguous','signed-tenant-b',1,'supervisor',7,'Teacher')");
  assert.equal((await send(joined)).status,503,'Ambiguous room ownership never chooses a database arbitrarily');
  assert.equal(Number((await pools[0].query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),0);
  console.log('PASS signed multi-tenant webhook: two isolated DBs share numeric room ID, event selects owning room/egress DB only; duplicates idempotent; invalid signature401, unavailable registry503, ambiguous owner503. LiveKit presence/Egress HTTP mocked.');
}finally{
  await new Promise(resolve=>server?server.close(resolve):resolve());await new Promise(resolve=>mediaServer?mediaServer.close(resolve):resolve());
  const admin=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD||''});
  for(const database of databases){assert.match(database,/^nukhab_hook_[a-f0-9]{16}$/);await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);}await admin.end();
  for(const pool of pools)await pool.end();
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  if(path.resolve(temporary).startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(temporary).startsWith('nukhab-webhook-test-'))await rm(temporary,{recursive:true,force:true});
}
