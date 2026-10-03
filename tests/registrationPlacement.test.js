import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRegistrationPlacement, loadRegistrationPlacementOptions } from '../server/services/registrationPlacement.js';

const connection = { query: async (_sql, [id] = []) => [id === 7 ? [{ committeeId: 7, committeeName: 'حلقة الفجر', complexId: 1, complexName: 'مجمع النور' }] : []] };
test('registration requires real matching placement IDs and ignores submitted names', async () => {
  assert.deepEqual(await requireRegistrationPlacement(connection, {complexId:'1',committeeId:'7',complexName:'اسم مزيف'}),
    {committeeId:7,committeeName:'حلقة الفجر',complexId:1,complexName:'مجمع النور'});
  for (const value of [undefined,null,'',true,[],{},0,-1,1.5,'1.0','1e0','7x','9007199254740992']) {
    await assert.rejects(requireRegistrationPlacement(connection,{complexId:value,committeeId:7}),{statusCode:422});
    await assert.rejects(requireRegistrationPlacement(connection,{complexId:1,committeeId:value}),{statusCode:422});
  }
  await assert.rejects(requireRegistrationPlacement(connection,{complexId:2,committeeId:7}),{statusCode:422});
  await assert.rejects(requireRegistrationPlacement(connection,{complexId:1,committeeId:8}),{statusCode:422});
});
test('legacy requests may derive the complex from a real circle but explicit mismatches remain invalid', async () => {
  assert.equal((await requireRegistrationPlacement(connection,{committeeId:7},{allowDerivedComplex:true})).complexId,1);
  await assert.rejects(requireRegistrationPlacement(connection,{committeeId:7,complexId:2},{allowDerivedComplex:true}),{statusCode:422});
  await assert.rejects(requireRegistrationPlacement(connection,{committeeId:7,complexId:''},{allowDerivedComplex:true}),{statusCode:422});
});
test('public options contain actual names without account or student data', async () => {
  const queries=[];
  const db={query:async sql=>{queries.push(sql);return [sql.includes('FROM committees')?[{id:7,name:'حلقة الفجر',complexId:1}]:[{id:1,name:'مجمع النور'}]];}};
  assert.deepEqual(await loadRegistrationPlacementOptions(db),{complexes:[{id:1,name:'مجمع النور'}],committees:[{id:7,name:'حلقة الفجر',complexId:1}]});
  assert.match(queries[1],/JOIN complexes/);
  assert.ok(queries.every(sql=>!sql.includes('students')&&!sql.includes('phone')&&!sql.includes('points')));
});
