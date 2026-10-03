import '../server/loadEnvironment.js';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { app } from '../server/index.js';
import { up } from '../server/migrations/2026.10.03.1-registration-placement.js';

assert.ok(['localhost','127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE,'nukhab_local');
const database=`nukhab_registration_${randomUUID().replaceAll('-','').slice(0,16)}`;
let pool;
try {
  pool=await initDatabase(database,{seedDefaultData:false});
  await runWithDatabase(database,{},async()=>{
    await up(pool); // A retry must not duplicate columns, indexes or constraints.
    await pool.query("INSERT INTO complexes(id,name) VALUES(1,'مجمع النور'),(2,'مجمع الفرقان'),(3,'مجمع بلا حلقات')");
    await pool.query("INSERT INTO committees(id,name,complex_id) VALUES(7,'حلقة الفجر',1),(8,'حلقة العصر',2),(9,'حلقة غير مرتبطة',NULL)");
    await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(11,'Test','registration-admin','','','','admin'),(12,'Test','registration-denied','','','','admin')");
    await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(11,'registrationRequests')");
    await pool.query("UPDATE app_settings SET setting_value='true' WHERE setting_key='registrationEnabled'");
    await pool.query("UPDATE app_settings SET setting_value='' WHERE setting_key IN ('registrationAcceptTemplate','registrationPreAcceptTemplate','registrationRejectTemplate')");
    const manager={role:'manager',id:1};
    const invoke=async(path,method,{auth=manager,body={},params={}}={})=>{
      const route=app.router.stack.find(item=>item.route?.path===path&&item.route.methods[method]).route;
      const req={auth,body,params};
      let finish;
      const res={statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;finish?.();return this;}};
      for(const layer of route.stack){
        let nextCalled=false,error;
        await new Promise((resolve,reject)=>{
          finish=resolve;
          try { Promise.resolve(layer.handle(req,res,reason=>{nextCalled=true;error=reason;resolve();})).catch(reject); } catch(reason){reject(reason);}
        });
        if(error)throw error;
        if(!nextCalled)break;
      }
      return res;
    };
    const publicPath='/api/registration/public',acceptPath='/api/registration-requests/:id/accept',listPath='/api/registration-requests';
    const person={name:'طالب اختبار',guardianPhone:'',nationalId:'',age:12,complexId:1,committeeId:7,memorization:{fullJuzs:[1,2]}};
    const submit=body=>invoke(publicPath,'post',{body});
    const accept=(id,body={},auth=manager)=>invoke(acceptPath,'post',{auth,params:{id:String(id)},body:{loginNumber:String(600000+id),password:'test-password',testResults:{'juz-1':'passed','juz-2':'failed'},...body}});
    const options=(await invoke(publicPath,'get')).body;
    assert.deepEqual(options.complexes.map(row=>row.name).sort((a,b)=>a.localeCompare(b,'ar')),['مجمع النور','مجمع الفرقان','مجمع بلا حلقات'].sort((a,b)=>a.localeCompare(b,'ar')));
    assert.deepEqual(options.committees.map(row=>Number(row.id)).sort((a,b)=>a-b),[7,8]);
    assert.ok(options.committees.every(row=>Object.keys(row).sort((a,b)=>a.localeCompare(b)).join(',')==='complexId,id,name'));
    for(const override of [{complexId:null},{committeeId:null},{complexId:2},{committeeId:9},{committeeId:'7x'},{committeeId:999}]) {
      await assert.rejects(submit({...person,...override}),{statusCode:422});
    }
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM registration_requests'))[0][0].count),0);
    const request=(await submit(person)).body;
    const duplicate=await submit(person);
    assert.equal(duplicate.statusCode,409);
    const saved=(await invoke(listPath,'get')).body.requests[0];
    assert.deepEqual([saved.complexId,saved.complexName,saved.committeeId,saved.committeeName],[1,'مجمع النور',7,'حلقة الفجر']);
    for(const auth of [{role:'student',id:3},{role:'supervisor',id:7},{role:'admin',id:12},{}]) {
      assert.equal((await accept(request.id,{},auth)).statusCode,403);
      assert.equal((await invoke(listPath,'get',{auth})).statusCode,403);
    }
    await assert.rejects(accept(request.id,{complexId:2,committeeId:7}),{statusCode:422});
    await assert.rejects(accept(request.id,{password:''}),{statusCode:422});
    await assert.rejects(accept(request.id,{testResults:{'juz-1':'passed'}}),{statusCode:422});
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM students'))[0][0].count),0);
    const accepted=await accept(request.id,{}, {role:'admin',id:11});
    assert.equal(accepted.statusCode,201);
    assert.equal(accepted.body.student.committeeId,7);
    assert.equal(accepted.body.student.complexId,1);
    const [[student]]=await pool.query('SELECT s.committee_id AS committeeId,c.complex_id AS complexId FROM students s JOIN committees c ON c.id=s.committee_id WHERE s.id=?',[accepted.body.student.id]);
    assert.deepEqual(student,{committeeId:7,complexId:1});
    const [prior]=await pool.query('SELECT start_surah AS surah,start_ayah AS ayah FROM student_quran_prior_memorization WHERE student_id=?',[accepted.body.student.id]);
    assert.equal(prior.length,1);
    assert.deepEqual(prior[0],{surah:1,ayah:1});
    assert.equal((await accept(request.id)).statusCode,404);
    const next=(await submit({...person,name:'طالب ثان'})).body;
    const results=await Promise.all([accept(next.id,{complexId:2,committeeId:8}),accept(next.id,{complexId:2,committeeId:8})]);
    assert.deepEqual(results.map(row=>row.statusCode).sort((a,b)=>a-b),[201,404]);
    assert.equal(results.find(row=>row.statusCode===201).body.student.committeeId,8);
    const moved=(await submit({...person,name:'طالب حلقة منقولة',complexId:2,committeeId:8})).body;
    await pool.query('UPDATE committees SET complex_id=1 WHERE id=8');
    await assert.rejects(accept(moved.id),{statusCode:422});
    assert.equal((await accept(moved.id,{complexId:1,committeeId:8})).statusCode,201);
    const removed=(await submit({...person,name:'طالب حلقة محذوفة',committeeId:8})).body;
    // Avoid deleting a populated circle: use a new, otherwise empty circle for the FK preservation check.
    await pool.query("INSERT INTO committees(id,name,complex_id) VALUES(10,'حلقة مؤقتة',1)");
    await pool.query('UPDATE registration_requests SET committee_id=10 WHERE id=?',[removed.id]);
    await pool.query('DELETE FROM committees WHERE id=10');
    const [[retained]]=await pool.query('SELECT committee_id AS committeeId FROM registration_requests WHERE id=?',[removed.id]);
    assert.equal(retained.committeeId,null);
    await assert.rejects(accept(removed.id),{statusCode:422});
    assert.equal((await accept(removed.id,{complexId:1,committeeId:7})).statusCode,201);
    const [legacy]=await pool.query("INSERT INTO registration_requests(name,guardian_phone,national_id,age,memorization_json) VALUES('طلب قديم','','',12,'{\"items\":[]}')");
    assert.equal((await accept(legacy.insertId,{committeeId:7})).statusCode,201);
    await pool.query("UPDATE app_settings SET setting_value='false' WHERE setting_key='registrationEnabled'");
    const closed=(await invoke(publicPath,'get')).body;
    assert.equal(closed.enabled,false);
    assert.deepEqual(closed.complexes,[]);assert.deepEqual(closed.committees,[]);
    assert.equal((await submit({...person,name:'طلب مغلق'})).statusCode,403);
    console.log('Registration MySQL passed: actual options, matching placement, permission denial, automatic assignment, passed memorization only, rollback, concurrent acceptance, moved/deleted circles, legacy requests, closed registration, and idempotent migration.');
  });
} finally {
  await pool?.end();
  const connection=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT)||3306,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try {assert.match(database,/^nukhab_registration_[a-f0-9]{16}$/);await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);} finally {await connection.end();}
}
