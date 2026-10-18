import '../server/loadEnvironment.js';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import archiveRouter from '../server/routes/callArchiveRoutes.js';
import { assertCallArchiveConsent, reconcileCallArchivePresence, processCallArchiveBatch, getCallArchiveRoomStates, finishCallArchiveRoom } from '../server/services/callArchive.js';
import { getCallArchiveConfig } from '../server/services/callArchiveConfig.js';
import { createCallArchiveStorage } from '../server/services/callArchiveStorage.js';
import { startCallArchiveWorker } from '../server/services/callArchiveWorker.js';

assert.ok(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_archive_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const temporary = await mkdtemp(path.join(tmpdir(), 'nukhab-archive-test-'));
const keys = ['CALL_ARCHIVE_ENABLED','CALL_ARCHIVE_STORAGE_PATH','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','OPENAI_API_KEY'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
Object.assign(process.env, { CALL_ARCHIVE_ENABLED:'true', CALL_ARCHIVE_STORAGE_PATH:temporary, LIVEKIT_URL:'http://127.0.0.1:1',LIVEKIT_API_KEY:'test-only',LIVEKIT_API_SECRET:'test-secret-never-used-externally',OPENAI_API_KEY:'mock-only' });
let pool, server, starts = 0;
let people = [];
const egresses = [];
const provider = {
  presence: async () => people,
  list: async () => egresses,
  async start(_room, media) {
    starts++;
    const info = { egressId:`egress-${starts}`, status:1, fileResults:[], outputPath:media.object_key, media };
    egresses.push(info); return info;
  },
  async stop(id) {
    const info = egresses.find(item => item.egressId === id);
    const target = path.join(temporary, ...info.media.object_key.split('/'));
    await mkdir(path.dirname(target), { recursive:true });
    await writeFile(target, Buffer.from('0123456789-local-mocked-mp4'));
    info.status=3; info.fileResults=[{ size:25n, duration:20000000000n, filename:info.outputPath }];
    return info;
  },
};
const report = { summary:'تقرير اختبار محلي بموفر صوت وذكاء اصطناعي وهميين.',passage:'',observations:[{id:'observation-1',atSeconds:2,endSeconds:4,speaker:'A',category:'possible_error',detail:'موضع مراجعة',correction:'إعادة',response:'أعاد',confidence:'medium'},
  {id:'observation-2',atSeconds:6,endSeconds:7,speaker:'B',category:'unclear',detail:'غير واضح',correction:'',response:'',confidence:'low'}],followUp:['مراجعة'],limitations:['اختبار موفر وهمي، لا يثبت دقة التلاوة.'] };
const ai = { transcribe:async () => ({text:'اختبار',segments:[{start:1,end:5,text:'اختبار',speaker:'A'}]}),summarize:async () => report };
const supervisor = {role:'supervisor',id:7,name:'Teacher'}, student = {role:'student',id:3,name:'Student'};
const tokenHash = createHash('sha256').update('local-session').digest('hex');
try {
  pool = await initDatabase(database, { seedDefaultData:false });
  await pool.query("INSERT INTO committees (id,name) VALUES (1,'Archive one'),(2,'Archive two')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role,password_hash) VALUES(7,'Teacher','archive-teacher','','','','supervisor','test-only'),(9,'Other','archive-other','','','','reciter','test-only')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role,password_hash) VALUES(8,'Manager','archive-manager','','','','manager','test-only'),(10,'Admin','archive-admin','','','','admin','test-only')");
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,password_hash) VALUES(3,'Student','archive-one','','',1,'test-only'),(4,'Other','archive-two','','',2,'test-only')");
  await pool.query("INSERT INTO auth_sessions(token_hash,user_role,user_id,user_name) VALUES(?,'manager',8,'Manager')",[tokenHash]);
  const [created] = await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Persistent room','archive-room',1,'supervisor',7,'Teacher')");
  const roomId = created.insertId;
  const run = action => runWithDatabase(database,{tenant:{registrationNumber:'',databaseName:database}},action);
  const config = getCallArchiveConfig(), storage = createCallArchiveStorage(config);
  const batch = () => run(() => processCallArchiveBatch({ config, provider, storage, ai }));
  await run(async () => {
    await assert.rejects(() => assertCallArchiveConsent(student,roomId,false),error => error.statusCode===422 && error.code==='recording_consent_required');
    await assertCallArchiveConsent(supervisor,roomId,true); await assertCallArchiveConsent(student,roomId,true);
  });
  people=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_A']}];
  await run(() => reconcileCallArchivePresence('archive-room',{config,provider}));
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),0);
  people.push({identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_B']});
  await Promise.all([run(() => reconcileCallArchivePresence('archive-room',{config,provider})),run(() => reconcileCallArchivePresence('archive-room',{config,provider}))]);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),1);
  const [[first]] = await pool.query('SELECT * FROM call_archive_sessions LIMIT 1');
  await Promise.all([batch(),batch()]);
  await pool.query('UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3) WHERE session_id=?',[first.id]);
  await batch();
  assert.equal(starts,3,'One mixed capture plus one microphone capture per human; repeated events cannot duplicate');
  assert.equal((await run(() => getCallArchiveRoomStates([roomId])))[roomId].state,'recording');
  people=[];
  await batch();
  assert.equal((await pool.query('SELECT state FROM call_archive_sessions WHERE id=?',[first.id]))[0][0].state,'recording','Reconnect grace keeps the same session');
  await pool.query('UPDATE call_archive_sessions SET empty_since=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 40 SECOND) WHERE id=?',[first.id]);
  await batch();
  await pool.query('UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3) WHERE session_id=?',[first.id]);
  await batch(); await batch();
  const [[done]] = await pool.query('SELECT * FROM call_archive_sessions WHERE id=?',[first.id]);
  assert.equal(done.state,'ready'); assert.equal(done.report_state,'ready');
  assert.equal((await pool.query('SELECT status FROM call_rooms WHERE id=?',[roomId]))[0][0].status,'open');
  assert.equal(JSON.parse(done.report_json).observations.length,2);
  const app=express(); app.use(express.json());
  app.use((req,_res,next) => { if(req.get('x-test-role')) req.auth={role:req.get('x-test-role'),id:Number(req.get('x-test-id')),name:'Test',tokenHash:req.get('x-test-token-hash')||undefined}; return runWithDatabase(database,{},next); });
  app.use('/api/calls/archive',archiveRouter);
  app.use((error,_req,res,next) => { if(res.headersSent) return next(error); return res.status(error.statusCode||500).json({message:error.message}); });
  server=await new Promise(resolve => { const instance=app.listen(0,'127.0.0.1',() => resolve(instance)); });
  const request=async (url,{role='manager',id=8,method='GET',body,headers={}}={}) => {
    const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}${url.startsWith('/api')?url:'/api/calls/archive'+url}`,{method,headers:{'Content-Type':'application/json',...(role?{'x-test-role':role,'x-test-id':String(id)}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,headers:response.headers,text:await response.text()};
  };
  assert.equal((await request('/',{role:null})).status,401);
  assert.equal((await request(`/sessions/${first.id}`,{role:'student',id:4})).status,403);
  assert.equal((await request(`/sessions/${first.id}`,{role:'reciter',id:9})).status,403);
  assert.equal((await request(`/sessions/${first.id}`,{role:'student',id:3})).status,403);
  for (const [role,id] of [['student',3],['supervisor',7],['reciter',9],['teacher',11],['admin',10]]) {
    for (const route of ['/',`/rooms/${roomId}`,`/sessions/${first.id}`]) assert.equal((await request(route,{role,id})).status,403,`${role} cannot read ${route}`);
    assert.equal((await request(`/sessions/${first.id}/review`,{role,id,method:'PUT',body:{notes:'',approvedErrors:[]}})).status,403);
    assert.equal((await request(`/sessions/${first.id}/retry`,{role,id,method:'POST',body:{}})).status,403);
  }
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(10,'calls'),(9,'calls'),(7,'calls')");
  assert.equal((await request(`/sessions/${first.id}`,{role:'admin',id:10})).status,200,'Administrator with calls permission can read archives');
  assert.equal((await request(`/sessions/${first.id}`,{role:'reciter',id:9})).status,403,'Reciter grants never grant archive access');
  assert.equal((await request(`/sessions/${first.id}`,{role:'supervisor',id:7})).status,403,'Supervisor grants never grant archive access');
  assert.equal((await request(`/sessions/${first.id}/review`,{role:'student',id:3,method:'PUT',body:{notes:'',approvedErrors:[]}})).status,403);
  assert.equal((await request(`/sessions/${first.id}/review`,{method:'PUT',body:{notes:'',approvedErrors:[{id:'forged',note:''}]}})).status,422);
  assert.equal((await request(`/sessions/${first.id}/review`,{method:'PUT',body:{notes:'',approvedErrors:[{id:'observation-2',note:''}]}})).status,422);
  assert.equal((await request(`/sessions/${first.id}/review`,{method:'PUT',body:{notes:'اعتماد يدوي',approvedErrors:[{id:'observation-1',note:'راجع المقرئ التسجيل'}]}})).status,200);
  const [[mixed]]=await pool.query("SELECT * FROM call_archive_media WHERE session_id=? AND kind='mixed'",[first.id]);
  for (const [role,id] of [['student',3],['supervisor',7],['reciter',9],['teacher',11]]) {
    assert.equal((await request(`/sessions/${first.id}/media/${mixed.id}/playback`,{role,id,method:'POST'})).status,403);
    const legacyToken = createHash('sha256').update(`legacy-${role}`).digest('hex');
    await pool.query('INSERT INTO call_archive_playback_grants(token_hash,session_id,media_id,actor_role,actor_id,expires_at) VALUES(?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 2 MINUTE))',[createHash('sha256').update(legacyToken).digest('hex'),first.id,mixed.id,role,id]);
    assert.equal((await request(`/playback/${legacyToken}`,{role:null})).status,403,'Previously issued non-administration playback grants are rejected');
  }
  assert.equal((await request(`/sessions/${first.id}/media/${mixed.id}/playback`,{role:'student',id:4,method:'POST'})).status,403);
  const playback=JSON.parse((await request(`/sessions/${first.id}/media/${mixed.id}/playback`,{method:'POST',headers:{'x-test-token-hash':tokenHash}})).text);
  assert.equal(playback.url.includes(mixed.object_key),false);
  const range=await request(playback.url,{role:null,headers:{Range:'bytes=2-5'}});
  assert.equal(range.status,206); assert.equal(range.text,'2345'); assert.equal(range.headers.get('cache-control'),'private, no-store');
  assert.equal((await request(playback.url,{role:null,method:'HEAD'})).status,200);
  assert.equal((await request(playback.url,{role:null,headers:{Range:'bytes=999-'}})).status,416);
  await pool.query('UPDATE supervisors SET is_active=0 WHERE id=8');
  assert.equal((await request(playback.url,{role:null})).status,403,'Disabled account immediately loses playback grant');
  await pool.query('UPDATE supervisors SET is_active=1 WHERE id=8');
  const adminHash=createHash('sha256').update('local-admin-session').digest('hex');
  await pool.query("INSERT INTO auth_sessions(token_hash,user_role,user_id,user_name) VALUES(?,'admin',10,'Admin')",[adminHash]);
  const adminPlayback=JSON.parse((await request(`/sessions/${first.id}/media/${mixed.id}/playback`,{role:'admin',id:10,method:'POST',headers:{'x-test-token-hash':adminHash}})).text);
  assert.equal((await request(adminPlayback.url,{role:null})).status,200,'Authorized administrator playback works before permission removal');
  await pool.query("DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id=10 AND permission_key='calls'");
  assert.equal((await request(adminPlayback.url,{role:null})).status,403,'Removing administrator calls permission revokes playback immediately');
  await pool.query('DELETE FROM auth_sessions WHERE token_hash=?',[tokenHash]);
  assert.equal((await request(playback.url,{role:null})).status,403,'Logout revokes unexpired audio grants');
  people=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_C']},{identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_D']}];
  await batch();
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_sessions'))[0][0].count),2,'Returning to an open room creates a new archived session');
  await run(() => finishCallArchiveRoom('archive-room'));
  await pool.query("UPDATE call_rooms SET status='closed' WHERE id=?",[roomId]);
  await batch();
  await pool.query('UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3)');
  await batch(); await batch();
  await pool.query('DELETE FROM call_rooms WHERE id=?',[roomId]);
  await pool.query('UPDATE students SET committee_id=NULL WHERE committee_id=1');
  await pool.query('DELETE FROM committees WHERE id=1');
  assert.equal((await request(`/sessions/${first.id}`)).status,200,'Administration archive snapshots survive source room/circle deletion');
  const [autoRoom]=await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Auto-finish room','auto-finish-room',2,'supervisor',7,'Teacher')");
  await run(async()=>{await assertCallArchiveConsent(supervisor,autoRoom.insertId,true);await assertCallArchiveConsent(student,autoRoom.insertId,true);});
  people=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_AUTO1']},{identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_AUTO2']}];
  await batch();
  const [[autoFirst]]=await pool.query('SELECT * FROM call_archive_sessions WHERE active_room_id=?',[autoRoom.insertId]);
  assert.equal(autoFirst.state,'recording');
  people=[];
  // Real Egress naturally ends when its media room disappears. Participants
  // return before the next poll and before the 30-second app grace elapses.
  for(const info of egresses.filter(item=>item.media.session_id===autoFirst.id)) await provider.stop(info.egressId);
  people=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_RETURN1']},{identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_RETURN2']}];
  const startsBeforeReturn=starts;
  await batch(); await batch();
  const [autoSessions]=await pool.query('SELECT * FROM call_archive_sessions WHERE room_id=? ORDER BY started_at',[autoRoom.insertId]);
  assert.equal(autoSessions.length,2,'A naturally finalized Egress session is not reused during reconnect grace');
  assert.notEqual(autoSessions[1].id,autoFirst.id);
  assert.equal(starts,startsBeforeReturn+3,'Returning participants get an actual NEW mixed and two new microphone captures');
  assert.equal(autoSessions[1].state,'recording');
  await run(()=>finishCallArchiveRoom('auto-finish-room'));
  await pool.query("UPDATE call_rooms SET status='closed' WHERE id=?",[autoRoom.insertId]);
  await batch(); await pool.query('UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3)'); await batch(); await batch();
  await pool.query('DELETE FROM call_rooms WHERE id=?',[autoRoom.insertId]);
  const unrelated=Array.from({length:501},() => [randomUUID(),999,'unrelated-room','Other room','reciter',9,new Date()]);
  await pool.query('INSERT INTO call_archive_sessions(id,room_id,livekit_room_name,room_name,owner_role,owner_id,started_at) VALUES ?',[unrelated]);
  assert.equal((await request('/',{role:'student',id:3})).status,403,'Participants cannot list archives regardless of pagination');
  const managerIndex=JSON.parse((await request('/')).text);
  assert.equal(managerIndex.rooms.find(room=>Number(room.id)===roomId).sessionCount,2);
  const firstPage=JSON.parse((await request(`/rooms/${roomId}?limit=1`)).text);
  assert.equal(firstPage.sessions.length,1); assert.ok(firstPage.nextCursor);
  const secondPage=JSON.parse((await request(`/rooms/${roomId}?limit=1&before=${firstPage.nextCursor}`)).text);
  assert.equal(secondPage.sessions.length,1); assert.notEqual(secondPage.sessions[0].id,firstPage.sessions[0].id); assert.equal(secondPage.nextCursor,null);
  const [bad]=await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Unavailable','bad-room',2,'supervisor',7,'Teacher')");
  const faultyProvider={...provider,presence:async name => { if(name==='bad-room') throw new Error('Mock provider outage'); return []; }};
  await pool.query("UPDATE call_archive_jobs SET state='pending',next_at=CURRENT_TIMESTAMP(3) WHERE session_id=? AND kind='report'",[first.id]);
  await run(() => processCallArchiveBatch({config,provider:faultyProvider,storage,ai}));
  assert.equal((await pool.query("SELECT state FROM call_archive_jobs WHERE session_id=? AND kind='report'",[first.id]))[0][0].state,'done','One unavailable room cannot starve unrelated report jobs');
  await pool.query('DELETE FROM call_rooms WHERE id=?',[bad.insertId]);
  const [raceRoom]=await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Consent race','consent-race',2,'supervisor',7,'Teacher')");
  await run(async()=>{await assertCallArchiveConsent(supervisor,raceRoom.insertId,true);await assertCallArchiveConsent(student,raceRoom.insertId,true);});
  const accepted=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_R1']},{identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_R2']}];
  let presenceReads=0;
  const raceProvider={...provider,presence:async()=>{presenceReads++;return presenceReads>=3?[...accepted,{identity:'student:4',role:'student',id:4,name:'No consent',tracks:['TR_BAD']}]:accepted;}};
  await run(()=>reconcileCallArchivePresence('consent-race',{config,provider:raceProvider}));
  const beforeRace=starts;
  await run(()=>processCallArchiveBatch({config,provider:raceProvider,storage,ai}));
  assert.equal(starts,beforeRace,'Consent is rechecked at actual capture start, even after prior reconcile');
  await pool.query("UPDATE call_rooms SET status='closed'");
  const [failureRoom]=await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Failure exhaustion','failure-room',2,'supervisor',7,'Teacher')");
  await run(async()=>{await assertCallArchiveConsent(supervisor,failureRoom.insertId,true);await assertCallArchiveConsent(student,failureRoom.insertId,true);});
  people=[...accepted];
  const failingCapture={...provider,start:async()=>{throw new Error('Mock recording start outage');}};
  let failedSession;
  for(let attempt=0;attempt<5;attempt++){
    await run(()=>processCallArchiveBatch({config,provider:failingCapture,storage,ai}));
    [[failedSession]]=await pool.query('SELECT * FROM call_archive_sessions WHERE room_id=?',[failureRoom.insertId]);
    await pool.query("UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3) WHERE session_id=? AND kind='capture'",[failedSession.id]);
  }
  assert.equal(failedSession.state,'failed','Exhausted capture retries must stop claiming to be starting');
  assert.equal(failedSession.report_state,'failed');assert.equal(Number(failedSession.active_room_id),failureRoom.insertId);
  await run(()=>processCallArchiveBatch({config,provider:failingCapture,storage,ai}));
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM call_archive_sessions WHERE room_id=?',[failureRoom.insertId]))[0][0].count),1,'Failed active capture does not create unbounded archive sessions');
  const failedDetail=JSON.parse((await request(`/sessions/${failedSession.id}`)).text);
  assert.equal(failedDetail.session.active,true);
  assert.equal((await request(`/sessions/${failedSession.id}/retry`,{method:'POST'})).status,202);
  assert.equal((await pool.query('SELECT state FROM call_archive_sessions WHERE id=?',[failedSession.id]))[0][0].state,'starting');
  await batch();
  assert.equal((await pool.query('SELECT state FROM call_archive_sessions WHERE id=?',[failedSession.id]))[0][0].state,'recording','Manual capture retry starts actual recording');
  people[1]={...people[1],tracks:[...people[1].tracks,'TR_NEW_FAILURE']};
  const partialCapture={...provider,start:async(room,media)=>{if(media.track_id==='TR_NEW_FAILURE')throw new Error('Mock microphone capture outage');return provider.start(room,media);}};
  for(let attempt=0;attempt<5;attempt++){
    await run(()=>processCallArchiveBatch({config,provider:partialCapture,storage,ai}));
    await pool.query("UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3) WHERE session_id=? AND kind='capture'",[failedSession.id]);
  }
  const [[partial]]=await pool.query('SELECT * FROM call_archive_sessions WHERE id=?',[failedSession.id]);
  assert.equal(partial.state,'recording','A failed separate microphone does not hide a still-active mixed recorder');assert.ok(partial.last_error);assert.equal(Number(partial.recording_gap),1);
  await run(()=>finishCallArchiveRoom('failure-room'));
  await pool.query("UPDATE call_rooms SET status='closed' WHERE id=?",[failureRoom.insertId]);
  const failingStop={...provider,list:async()=>{throw new Error('Mock provider stop outage');}};
  for(let attempt=0;attempt<5;attempt++){
    await run(()=>processCallArchiveBatch({config,provider:failingStop,storage,ai}));
    await pool.query("UPDATE call_archive_jobs SET next_at=CURRENT_TIMESTAMP(3) WHERE session_id=? AND kind='stop'",[failedSession.id]);
  }
  const [[stopFailed]]=await pool.query('SELECT * FROM call_archive_sessions WHERE id=?',[failedSession.id]);
  assert.equal(stopFailed.state,'failed');assert.equal(stopFailed.report_state,'failed');assert.equal(stopFailed.active_room_id,null);assert.ok(stopFailed.ended_at);
  assert.equal((await request(`/sessions/${failedSession.id}/retry`,{method:'POST'})).status,422,'No report retry may pretend to recover past audio that never finalized');
  let reportStarted=false,releaseReport;
  const reportHold=new Promise(resolve=>{releaseReport=resolve;});
  const heldAI={...ai,summarize:async()=>{reportStarted=true;await reportHold;return report;}};
  await pool.query("UPDATE call_archive_jobs SET state='pending',next_at=CURRENT_TIMESTAMP(3) WHERE session_id=? AND kind='report'",[first.id]);
  const waitUntil=async predicate=>{for(let tries=0;tries<250;tries++){if(await predicate())return;await new Promise(resolve=>globalThis.setTimeout(resolve,20));}throw new Error('Timed out waiting for independent worker lane');};
  const stopScheduler=await run(()=>startCallArchiveWorker({intervalMs:20,reportIntervalMs:20,processBatch:options=>processCallArchiveBatch({...options,config,provider,storage,ai:heldAI})}));
  try{
    await waitUntil(()=>reportStarted);
    const [promptRoom]=await pool.query("INSERT INTO call_rooms(name,livekit_room_name,committee_id,created_by_role,created_by_id,created_by_name) VALUES('Recording while AI busy','prompt-room',2,'supervisor',7,'Teacher')");
    await run(async()=>{await assertCallArchiveConsent(supervisor,promptRoom.insertId,true);await assertCallArchiveConsent(student,promptRoom.insertId,true);});
    people=[{identity:'supervisor:7',role:'supervisor',id:7,name:'Teacher',tracks:['TR_PROMPT1']},{identity:'student:3',role:'student',id:3,name:'Student',tracks:['TR_PROMPT2']}];
    const startsBeforePrompt=starts;
    await waitUntil(async()=>{const [[row]]=await pool.query("SELECT COUNT(*) AS count FROM call_archive_media m JOIN call_archive_sessions s ON s.id=m.session_id WHERE s.active_room_id=? AND s.state='recording' AND m.state='recording'",[promptRoom.insertId]);return Number(row.count)===3;});
    assert.equal(starts,startsBeforePrompt+3,'Real scheduler starts mixed and human tracks while another room AI promise remains held');
    assert.equal((await pool.query("SELECT state FROM call_archive_jobs WHERE session_id=? AND kind='report'",[first.id]))[0][0].state,'running','The report remains deliberately blocked during new capture');
    await run(()=>processCallArchiveBatch({config,provider,storage,ai,kinds:['capture','stop'],reconcile:true}));
    assert.equal(starts,startsBeforePrompt+3,'Independent fast workers remain idempotent while the slow lane is occupied');
  }finally{
    stopScheduler();releaseReport();
    await waitUntil(async()=>{const [[row]]=await pool.query("SELECT state FROM call_archive_jobs WHERE session_id=? AND kind='report'",[first.id]);return row.state==='done';});
  }
  console.log('PASS archive MySQL: lifecycle, duplicate prevention, consent race, separate tracks, reconnect/new captures after Egress end, async mock AI, authority/Range/HEAD/revocation, deletion survival, pagination after501 unrelated sessions, failure exhaustion/manual retry, missing audio422, REAL independent scheduler captures while AI report held. External LiveKit/Egress/OpenAI mocked; not real recording/AI accuracy.');
} finally {
  await new Promise(resolve => server?server.close(resolve):resolve());
  const admin=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD||''});
  assert.match(database,/^nukhab_archive_[a-f0-9]{16}$/);
  await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); await pool?.end();
  for(const key of keys) { if(saved[key]===undefined) delete process.env[key]; else process.env[key]=saved[key]; }
  if(path.resolve(temporary).startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(temporary).startsWith('nukhab-archive-test-')) await rm(temporary,{recursive:true,force:true});
}
