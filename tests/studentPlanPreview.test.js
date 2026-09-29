import assert from 'node:assert/strict';
import test from 'node:test';
import { isStudentPlanDayComplete } from '../shared/student-plan-completion.js';
import { getStudentNextDayPreview, nameStudentPreviewTasks } from '../server/services/studentNextDayPreview.js';
import { filterPlanMarksByLatestAttempt } from '../server/services/studentPlanMarks.js';

const tasks = [
 {taskType:'memorization',teacherCompleted:true},
 {taskType:'review',studentStatus:'done',executionState:'complete'},
 {taskType:'link',teacherCompleted:true},
 {taskType:'repeat',teacherCompleted:true,actualRepeatCount:10,actualListeningCount:3},
];
const counts={repeatCount:10,listeningCount:3};

test('teacher assignments wait for recitation approval and student assignments allow full execution', async () => {
 const executed={taskType:'memorization',teacherCompleted:null,studentStatus:'done',executionState:'complete',executionActorRole:'student'};
 const options={date:'2026-09-06',tasks:[executed],executionSources:{memorization:'teacher'}};
 let loads=0;const load=async()=>{loads++;return [{taskType:'memorization'}];};
 assert.equal(await getStudentNextDayPreview(options,load),null);
 assert.equal(loads,0);
 assert.ok(await getStudentNextDayPreview({...options,tasks:[{...executed,teacherCompleted:true}]},load));
 for(const source of ['student','both']) assert.ok(await getStudentNextDayPreview({...options,executionSources:{memorization:source}},load));
 assert.equal(await getStudentNextDayPreview({...options,executionSources:{memorization:'both'},tasks:[{...executed,executionActorRole:'teacher'}]},load),null);
 assert.equal(await getStudentNextDayPreview({...options,executionSources:{memorization:'student'},tasks:[{...executed,executionState:'partial'}]},load),null);
});

test('generated and imported previews resolve both Quran endpoints to the stored surah names', async () => {
 const connection={query:async(sql,params)=>{
  assert.match(sql,/WHERE surah_number IN \(\?\)/);assert.deepEqual(params,[[3,2,1]]);
  return [[{id:1,name:'الفاتحة'},{id:2,name:'البقرة'},{id:3,name:'آل عمران'}]];
 }};
 const named=await nameStudentPreviewTasks(connection,[{fromSurah:3,toSurah:3},{fromSurah:2,toSurah:3},{fromSurah:1,toSurah:2}]);
 assert.deepEqual(named.map(t=>[t.fromSurahName,t.toSurahName]),[['آل عمران','آل عمران'],['البقرة','آل عمران'],['الفاتحة','البقرة']]);
 assert.deepEqual(await nameStudentPreviewTasks({query:()=>assert.fail('No query for empty preview')},[]),[]);
});
test('tomorrow requires every assignment, full execution, repetitions and listening', () => {
 assert.equal(isStudentPlanDayComplete([],counts),false);
 assert.equal(isStudentPlanDayComplete(tasks,counts),true);
 for(const change of [{teacherCompleted:false},{studentStatus:'pending',teacherCompleted:null},{studentStatus:'done',executionState:'partial',teacherCompleted:null}]) {
  assert.equal(isStudentPlanDayComplete([{...tasks[0],...change},...tasks.slice(1)],counts),false);
 }
 for(const change of [{actualRepeatCount:9},{actualListeningCount:2}]) assert.equal(isStudentPlanDayComplete([...tasks.slice(0,3),{...tasks[3],...change}],counts),false);
});
test('preview loads only after completion and rolls over the week without creating assignments', async () => {
 const calls=[];
 const load=async date=>{calls.push(date);return [{id:'preview',taskType:'memorization'}];};
 assert.equal(await getStudentNextDayPreview({date:'2026-09-12',tasks:[],...counts},load),null);
 assert.deepEqual(calls,[]);
 const next=await getStudentNextDayPreview({date:'2026-09-12',tasks,...counts},load);
 assert.equal(next.date,'2026-09-13');assert.deepEqual(calls,['2026-09-13']);
 assert.equal(await getStudentNextDayPreview({date:'2026-09-12',tasks,...counts},async()=>[]),null);
});
test('a later count-only evaluation hides old detailed marks while legacy and detailed selections survive', async () => {
 const marks=new Map([[1,[{selectedText:'الأول'}]],[2,[{selectedText:'الثاني'}]],[3,[{textUthmani:'قديم'}]]]);
 const connection={query:async(sql,values)=>{assert.match(sql,/is_official = 1/);assert.deepEqual(values,[[1,2,3]]);return [[{taskId:1,hasDetailedMarks:0},{taskId:2,hasDetailedMarks:1}]];}};
 await filterPlanMarksByLatestAttempt(connection,marks);
 assert.deepEqual(marks.get(1),[]);assert.equal(marks.get(2)[0].selectedText,'الثاني');assert.equal(marks.get(3)[0].textUthmani,'قديم');
});
