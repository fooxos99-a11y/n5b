import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { quranFacePositions, measureQuranFaces, quranRangeFacesSql, acceptedQuranExecutionSql } from '../server/services/quranFaceMeasurement.js';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.function('GREATEST', {varargs:true}, (...values)=>Math.max(...values));
  db.function('JSON_UNQUOTE', value => value);
  db.function('LEAST', {varargs:true}, (...values)=>Math.min(...values));
  db.exec(`CREATE TABLE quran_face_positions(surah INTEGER,ayah INTEGER,forward_start INTEGER,forward_end INTEGER,reverse_start INTEGER,reverse_end INTEGER,PRIMARY KEY(surah,ayah));
    CREATE TABLE tasks(from_surah INTEGER,from_ayah INTEGER,to_surah INTEGER,to_ayah INTEGER,actual_to_surah INTEGER,actual_to_ayah INTEGER,teacher_completed INTEGER,student_status TEXT,execution_state TEXT,review_execution_json TEXT);`);
  const insert=db.prepare('INSERT INTO quran_face_positions VALUES(?,?,?,?,?,?)');
  for(const r of quranFacePositions)insert.run(r.surah,r.ayah,r.forwardStart,r.forwardEnd,r.reverseStart,r.reverseEnd);
  return db;
}

test('SQL and JS measure identical line ranges, including descending surah transitions and actual ends',()=>{
 const db=fixture();
 try {
  const pairs=[[49,17,48,3],[45,33,44,11],[96,5,95,8],[2,1,2,5],[1,1,1,7],[114,1,113,1],[114,1,1,7]];
  for(let i=0;i<quranFacePositions.length;i+=19){const a=quranFacePositions[i],b=quranFacePositions[Math.min(i+5,quranFacePositions.length-1)];pairs.push([a.surah,a.ayah,b.surah,b.ayah]);}
  for(const [s,a,e,b] of pairs) {
   db.exec('DELETE FROM tasks');db.prepare('INSERT INTO tasks(from_surah,from_ayah,to_surah,to_ayah,actual_to_surah,actual_to_ayah,teacher_completed,student_status,execution_state) VALUES(?,?,?,?,NULL,NULL,1,?,?)').run(s,a,e,b,'done','complete');
   const sql=db.prepare(`SELECT ${quranRangeFacesSql('t','actual')} faces FROM tasks t`).get().faces;
   assert.equal(sql,measureQuranFaces({surah:s,ayah:a},{surah:e,ayah:b}));
  }
  assert.ok(measureQuranFaces({surah:49,ayah:17},{surah:48,ayah:3})<1,'short descending assignment must not span 6.75 faces');
  db.exec("DELETE FROM tasks; INSERT INTO tasks(from_surah,from_ayah,to_surah,to_ayah,actual_to_surah,actual_to_ayah,teacher_completed,student_status,execution_state) VALUES(2,1,2,20,2,5,1,'done','partial')");
  assert.equal(db.prepare(`SELECT ${quranRangeFacesSql('t','actual')} faces FROM tasks t`).get().faces,measureQuranFaces({surah:2,ayah:1},{surah:2,ayah:5}));
  db.exec('UPDATE tasks SET from_surah=NULL');
  assert.equal(db.prepare(`SELECT ${quranRangeFacesSql('t')} faces FROM tasks t`).get().faces,0);
 } finally {db.close();}
});

test('completion respects teacher rejection and accepts confirmed partial/student execution consistently',()=>{
 const db=fixture();
 try {
  for(const [teacher,status,state,expected] of [[1,null,null,1],[0,'done','complete',0],[null,'done','partial',1],[null,'done','extra',1],[null,'done',null,0],[null,'pending','complete',0]]) {
   db.exec('DELETE FROM tasks');db.prepare('INSERT INTO tasks(from_surah,from_ayah,to_surah,to_ayah,actual_to_surah,actual_to_ayah,teacher_completed,student_status,execution_state) VALUES(1,1,1,7,NULL,NULL,?,?,?)').run(teacher,status,state);
   assert.equal(Number(db.prepare(`SELECT COALESCE(${acceptedQuranExecutionSql('t')},0) accepted FROM tasks t`).get().accepted),expected);
  }
  assert.throws(()=>quranRangeFacesSql('t; DROP TABLE tasks'));
 }finally{db.close();}
});
import { readFileSync } from 'node:fs';
import { up, down } from '../server/migrations/2026.09.09.5-quran-face-positions.js';

test('report aggregation separates memorization and mastery and excludes repeat tasks from face totals',()=>{
 const db=fixture();
 try {
  db.exec(`ALTER TABLE tasks RENAME TO student_quran_tasks;
   ALTER TABLE student_quran_tasks ADD COLUMN task_type TEXT;
   ALTER TABLE student_quran_tasks ADD COLUMN track TEXT;
   ALTER TABLE student_quran_tasks ADD COLUMN student_id INTEGER;
   ALTER TABLE student_quran_tasks ADD COLUMN task_date TEXT;`);
  const insert=db.prepare('INSERT INTO student_quran_tasks(from_surah,from_ayah,to_surah,to_ayah,actual_to_surah,actual_to_ayah,teacher_completed,student_status,execution_state,task_type,track,student_id,task_date) VALUES(49,17,48,3,NULL,NULL,?,?,?, ?,?,1,?)');
  for(const [type,track] of [['memorization','memorization'],['memorization','mastery'],['review','memorization'],['link','memorization'],['repeat','memorization']])insert.run(1,'done','complete',type,track,'2026-09-09');
  insert.run(0,'done','complete','review','memorization','2026-09-09');
  const source=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
  const start=source.indexOf('const [[quranFaceTotals]]');
  const begin=source.indexOf('`',start),end=source.indexOf('`,',begin);
  const sql=new Function('quranTaskFacesSql','acceptedMemorizationSql','acceptedQuranExecutionSql','reportDb','studyDateSql','uncompensatedTaskSql',`return ${source.slice(begin,end+1)};`)(quranRangeFacesSql('t','actual'),acceptedQuranExecutionSql,acceptedQuranExecutionSql,{student:()=> '1=1'},()=> '1=1',()=> '1=1');
  const totals=db.prepare(sql).get('2026-09-09','2026-09-09');
  assert.deepEqual({...totals},{memorizationFaces:.5,masteryFaces:.5,reviewFaces:.5,linkFaces:.5});
 }finally{db.close();}
});

test('reference migration batches only immutable verse positions and has an isolated rollback',async()=>{
 const calls=[];await up({query:async(sql,params=[])=>{calls.push({sql,params});}});
 assert.equal(calls.slice(1).reduce((sum,call)=>sum+call.params.length/6,0),quranFacePositions.length);
 assert.equal(new Set(quranFacePositions.map(row=>`${row.surah}:${row.ayah}`)).size,quranFacePositions.length);
 for(const call of calls){assert.match(call.sql,/quran_face_positions/);assert.doesNotMatch(call.sql,/student_|points/);}
 const rolled=[];await down({query:async sql=>rolled.push(sql)});
 assert.deepEqual(rolled,['DROP TABLE IF EXISTS quran_face_positions']);
});

test('cyclic faces use saved quantity rather than a repeated endpoint', () => {
 const db=fixture();
 try {
  db.exec("INSERT INTO tasks(review_execution_json) VALUES ('{\"faces\":15}'), ('{\"faces\":0}')");
  assert.equal(db.prepare(`SELECT SUM(${quranRangeFacesSql('t','actual')}) faces FROM tasks t`).get().faces,15);
 } finally {db.close();}
});
