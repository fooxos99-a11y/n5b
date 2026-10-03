import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { TextDecoder, TextEncoder } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { assertAdministratorScope } from '../server/services/administratorScope.js';
import { assertSupervisorStudentScope } from '../server/services/supervisorStudentScope.js';
import { assertDailyGradeNotCompensated } from '../server/services/compensatedGradeGuard.js';

test('a delegated supervisor cannot grant a permission it lacks or manage a stronger account', async()=>{
  const grants=new Map([[7,['supervisors','trackSession']],[8,['settings']]]);
  const connection={query:async(_sql,[id])=>[(grants.get(id)||[]).map(permissionKey=>({permissionKey}))]};
  await assertAdministratorScope(connection,{role:'supervisor',id:7},{permissions:['trackSession'],managementPermission:'supervisors'});
  await assert.rejects(assertAdministratorScope(connection,{role:'supervisor',id:7},{permissions:['settings'],managementPermission:'supervisors'}),{status:403});
  await assert.rejects(assertAdministratorScope(connection,{role:'supervisor',id:7},{targetId:8,managementPermission:'supervisors'}),{status:403});
  await assert.rejects(assertAdministratorScope(connection,{role:'supervisor',id:7},{permissions:['trackSession']}),{status:403});
});

test('supervisor student administration requires both the current student and destination circle in scope',async()=>{
  const connection={query:async(sql,values)=>sql.includes('FROM students')?[values[1]===3?[{allowed:1}]:[]]:[[{id:1}]]};
  const actor={role:'supervisor',id:7};
  await assertSupervisorStudentScope(connection,actor,{studentId:3,committeeIds:[1]});
  await assert.rejects(assertSupervisorStudentScope(connection,actor,{studentId:9}),{status:403});
  await assert.rejects(assertSupervisorStudentScope(connection,actor,{studentId:3,committeeIds:[2]}),{status:403});
  await assert.rejects(assertSupervisorStudentScope(connection,actor,{committeeIds:[null]}),{status:403});
  await assertSupervisorStudentScope(connection,{role:'manager',id:1},{studentId:9,committeeIds:[2]});
});

test('compensated achievement grades resist normal overwrite while attendance remains independent',async()=>{
  let queried=0;
  const connection={query:async()=>{queried++;return[[{id:11}]];}};
  await assert.rejects(assertDailyGradeNotCompensated(connection,{studentId:3,date:'2026-10-02',component:'reading'}),{status:409});
  await assertDailyGradeNotCompensated(connection,{studentId:3,date:'2026-10-02',component:'memorization',compensationId:11});
  await assertDailyGradeNotCompensated(connection,{studentId:3,date:'2026-10-02',component:'attendance'});
  assert.equal(queried,2);
});

const streamSource=(await readFile(new URL('../src/services/callDirectory.js',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'').replace('export function','function');
for(const changeSession of [false,true])test(`live call streaming handles fragmented UTF-8 frames and ${changeSession?'drops old-session events':'updates without page refresh'}`,async()=>{
  let version=0,headers,stop;
  const delivered=[],errors=[];
  const encoded=new TextEncoder().encode(': heartbeat\n\ndata: '+JSON.stringify({rooms:[{name:'أحمد'}]})+'\n\ndata: '+JSON.stringify({rooms:[{name:'محمد'}]})+'\n\n');
  const context={AbortController:globalThis.AbortController,TextDecoder,Capacitor:{isNativePlatform:()=>true},
    getAuthSessionVersion:()=>version,getBearerToken:async()=>'test-token',getApiBase:()=>'/api',getTenantRegistrationNumber:()=> 'test-tenant',
    window:{setTimeout:()=>0,clearTimeout:()=>{}},
    fetch:async(_url,options)=>{headers=options.headers;return new globalThis.Response(new globalThis.ReadableStream({start(controller){for(let i=0;i<encoded.length;i+=7)controller.enqueue(encoded.slice(i,i+7));controller.close();}}));},
  };
  vm.runInNewContext(streamSource+'\nglobalThis.subscribe=subscribeCallDirectory;',context);
  stop=context.subscribe({onData:value=>{delivered.push(value);if(changeSession)version++;},onError:error=>errors.push(error)});
  await setImmediate(); await setImmediate(); stop();
  assert.deepEqual(delivered.map(row=>row.rooms[0].name),changeSession?['أحمد']:['أحمد','محمد']);
  assert.equal(headers.Authorization,'Bearer test-token');assert.equal(headers['X-Registration-Number'],'test-tenant');assert.equal(headers['X-Nukhab-Native'],'1');
  assert.equal(errors.length,changeSession?0:1);
});
