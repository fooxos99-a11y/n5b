import assert from 'node:assert/strict';
import test from 'node:test';
import { teacherRecordingCompletion, loadTeacherRecordingCompletion } from '../server/services/teacherRecordingCompletion.js';
import { branchPassingOverview, loadBranchPassingOverview } from '../server/services/branchPassingOverview.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

test('teacher completion counts a student/day after every outcome, including recorded failures', () => {
  const dates=['2026-10-11','2026-10-12'];
  const rows=[{ teacherId:7,date:dates[0],requiredTasks:3,recordedTasks:3 },
    { teacherId:7,date:dates[0],requiredTasks:2,recordedTasks:1 },
    { teacherId:7,date:dates[1],requiredTasks:1,recordedTasks:1 },
    { teacherId:7,date:dates[1],requiredTasks:0,recordedTasks:0 },
    { teacherId:7,date:'2026-10-13',requiredTasks:1,recordedTasks:1 }];
  assert.deepEqual(teacherRecordingCompletion(rows,[],dates).get('7'),{ completed:2,expected:3,percentage:67 });
});
test('reading must be recorded, missed reading counts as a recorded outcome, no amount is not required', () => {
  const date='2026-10-11';
  const rows=[{ teacherId:7,date,hasReadingAmount:1,readingRecorded:0,requiredTasks:1,recordedTasks:1 },
    { teacherId:7,date,hasReadingAmount:1,readingRecorded:1,requiredTasks:0,recordedTasks:0 },
    { teacherId:7,date,hasReadingAmount:0,readingRecorded:0,requiredTasks:0,recordedTasks:0 }];
  assert.deepEqual(teacherRecordingCompletion(rows,[date],[date]).get('7'),{ completed:1,expected:2,percentage:50 });
  assert.equal(teacherRecordingCompletion([],[],[]).size,0);
});

test('Friday and Saturday self reading never creates a teachers recording obligation outside program days', async () => {
  const friday='2026-10-09', saturday='2026-10-10', sunday='2026-10-11';
  const rows=[{ teacherId:7,date:friday,hasReadingAmount:1,readingRecorded:0,requiredTasks:0,recordedTasks:0 },
    { teacherId:7,date:saturday,hasReadingAmount:1,readingRecorded:0,requiredTasks:2,recordedTasks:0 },
    { teacherId:7,date:sunday,requiredTasks:2,recordedTasks:2 }];
  assert.deepEqual(teacherRecordingCompletion(rows,[friday,saturday],[sunday]).get('7'),{ completed:1,expected:1,percentage:100 });
  assert.equal(teacherRecordingCompletion(rows,[friday,saturday],[]).size,0);
  const noQueries={ query:async () => { throw new Error('No program day requires no query'); } };
  assert.equal((await loadTeacherRecordingCompletion(noQueries,{ from:friday,to:saturday,attendanceDates:[],readingDays:[5,6] })).size,0);
});
test('recording queries bind scope, exclude absence/holidays/compensations and require the teachers own official record', async () => {
  const calls=[];
  const scope=createOverviewReportScope({ query:async (sql,values) => { calls.push({ sql,values }); return [[]]; } },{ auth:{ role:'supervisor',id:7 },committeeId:3,complexId:2 });
  await loadTeacherRecordingCompletion(scope,{ from:'2026-10-11',to:'2026-10-12',attendanceDates:['2026-10-11'] });
  assert.match(calls[0].sql,/ar.status IN \('present','late'\)/);
  assert.match(calls[0].sql,/attempt.evaluator_id=sc.supervisor_id/);
  assert.match(calls[0].sql,/attempt.is_official=1/);
  assert.doesNotMatch(calls[0].sql,/attempt.teacher_completed=1|g.passed=1/);
  assert.match(calls[0].sql,/t.compensation_index=0/);
  assert.match(calls[0].sql,/ar.record_date IN \(\?\)/);
  assert.match(calls[0].sql,/individual_pause/);
  assert.ok([7,3,2].every(value=>calls[0].values.includes(value)));
  assert.equal(calls[0].values[1],'2026-10-11');
});
const ayahs=[{ surah:1,ayah:1,page:1,juz:1 },{ surah:1,ayah:2,page:1,juz:1 },{ surah:2,ayah:1,page:2,juz:2 }];
const task=(studentId,endAyah=2)=>({ studentId,studentName:`Student ${studentId}`,committeeName:'Own',startPage:1,startSurah:1,startAyah:1,endPage:1,endSurah:1,endAyah });
test('branch completion is distinct students, any completed attempt, full current-plan juz only', () => {
  const dates={ from:'2026-10-01',to:'2026-10-13' };
  const attempts=[{ studentId:1,juzNumber:1,date:'2026-10-12',passed:false },{ studentId:1,juzNumber:1,date:'2026-10-12',passed:true },
    { studentId:2,juzNumber:1,date:'2026-10-14' },{ studentId:3,juzNumber:1,date:'2026-09-30' }];
  const result=branchPassingOverview(ayahs,[task(1),task(2),task(3),task(4,1)],attempts,dates);
  assert.deepEqual([result.expected,result.tested,result.percentage],[2,1,50]);
  assert.deepEqual(result.studentsList.map(student=>student.id),[2,1]);
  const allTested=branchPassingOverview(ayahs,[task(1),task(2)],
    [...attempts,{ studentId:2,juzNumber:1,date:'2026-10-13' }],dates);
  assert.deepEqual([allTested.expected,allTested.tested,allTested.percentage],[2,2,100]);
  assert.equal(branchPassingOverview(ayahs,[],attempts,dates).percentage,null);
});
test('branch report rejects prior-only memorization, hafiz exams and out-of-scope students in its scoped queries', async () => {
  const calls=[];
  const scope=createOverviewReportScope({ query:async (sql,values) => { calls.push({ sql,values }); return [[task(1)]]; } },{ auth:{ role:'supervisor',id:7 },complexId:2 });
  await loadBranchPassingOverview(scope,{ from:'2026-10-01',to:'2026-10-13',referenceConnection:{ query:async()=>[ayahs] } });
  assert.match(calls[0].sql,/t.teacher_completed=1/);
  assert.match(calls[0].sql,/MAX\(current_plan.id\)/);
  assert.doesNotMatch(calls[0].sql,/prior_memorization/);
  assert.match(calls[1].sql,/e.exam_type='branch'/);
  assert.ok(calls.every(call=>call.values.includes(7)&&call.values.includes(2)));
});
