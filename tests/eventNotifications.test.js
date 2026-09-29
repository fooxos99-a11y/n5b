import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEventNotifications, formatEventNotification } from '../shared/event-notifications.js';
import { emitEventNotification } from '../server/services/eventNotifications.js';
function storage() {
  const messages = new Map(), recipients = new Set(), deliveries = new Set();
  return { messages, recipients, deliveries, async query(sql, values = []) {
    if (sql.includes('FROM supervisors')) return [[{id:2,role:'admin'},{id:3,role:'manager'}].filter(p=>values[0].includes(p.id))];
    if (sql.startsWith('INSERT INTO app_notifications')) { if(!messages.has(values[2])) messages.set(values[2], {id:messages.size+1,body:values[1]}); return [{insertId:messages.get(values[2]).id}]; }
    if (sql.startsWith('INSERT IGNORE INTO app_notification_recipients')) { recipients.add(values.join(':')); return [{}]; }
    if (sql.startsWith('INSERT IGNORE INTO notification_push_deliveries')) { for(const recipient of recipients) if(recipient.startsWith(values[0]+':')) deliveries.add(recipient); return [{}]; }
    throw new Error('Unexpected query: '+sql);
  }};
}
test('disabled events do not write inbox or push deliveries', async()=>{
 for(const type of ['storeOrder']) {
  const config=normalizeEventNotifications({[type]:{enabled:false}});
  const result=await emitEventNotification({query:()=>{throw new Error('must not query');}},{type,key:'1',config,recipients:[{role:'student',id:1}]});
  assert.equal(result,null,`${type} must stay silent when disabled`);
 }
});
test('retired store notifications cannot be enabled or emitted by stale callers', async () => {
 const db = {query: () => {throw new Error('Retired event must not query or write');}};
 const stale = {storeOrder: {enabled: true, administrators: [2, 3]}};
 assert.deepEqual(normalizeEventNotifications(stale), {});
 for (const config of [stale, normalizeEventNotifications(stale), undefined]) {
  assert.equal(await emitEventNotification(db, {type: 'storeOrder', key: '7', config, recipients: [{role: 'admin', id: 2}]}), null);
 }
});
test('templates substitute values once and removed student events stay silent',async()=>{
 const db=storage(),config=normalizeEventNotifications({violation:{enabled:true}});
 assert.equal(Object.hasOwn(config,'violation'),false);
 assert.equal(await emitEventNotification(db,{type:'violation',key:'1',config,recipients:[{role:'student',id:11}],values:{reason:'سبب'}}),null);
 assert.equal(db.messages.size,0);
 assert.equal(formatEventNotification('{student} {reason}',{student:'{reason}',reason:'اختبار'}),'{reason} اختبار');
});
test('removed programs feature has no event notification',()=>{
 assert.equal(Object.hasOwn(normalizeEventNotifications({program:{enabled:true}}),'program'),false);
});
