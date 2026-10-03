import test from 'node:test';
import assert from 'node:assert/strict';
import { changeStudentPlanPause, parseStudentPlanPause, studentPlanPauseStatus, studentPlanPauseHolidays, isStudentStudyHoliday } from '../shared/student-plan-pause.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';
import { forecastQuranPlan } from '../server/services/quranPlanForecast.js';
import { loadExpectedGrades } from '../server/services/expectedGrades.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { studentHomePlan } from '../src/lib/studentHome.js';

const actor = {role:'manager',id:1};
const change = (state, paused, date, revision = state.revision) => changeStudentPlanPause(state,{paused,date,revision,actor});
const allDays = [0,1,2,3,4,5,6];
const calendar = (pause, holidays = []) => ({student:()=> '1=1',query:async sql => {
  if (sql.includes('AS holidays')) return [[{holidays:JSON.stringify(holidays)}]];
  if (sql.includes('AS pause')) return [[{pause:JSON.stringify(pause)}]];
  if (sql.includes('FROM students')) return [[{id:1,joined:'2020-01-01'}]];
  return [[]];
}});

test('pause/resume preserves dated intervals, is idempotent, and refuses stale changes', () => {
  const initial = parseStudentPlanPause();
  const paused = change(initial,true,'2026-01-03');
  assert.deepEqual(studentPlanPauseStatus(paused),{paused:true,pausedFrom:'2026-01-03',revision:1});
  assert.deepEqual(change(paused,true,'2026-01-05',0),paused);
  assert.throws(()=>change(paused,false,'2026-01-06',0),{status:409});
  const resumed = change(paused,false,'2026-01-06');
  assert.equal(resumed.periods[0].endDate,'2026-01-05');
  const second = change(resumed,true,'2026-01-08');
  assert.equal(second.periods.length,2);
  const final = change(second,false,'2026-01-10');
  assert.equal(final.periods[1].endDate,'2026-01-09');
  assert.equal(studentPlanPauseStatus(final).paused,false);
  assert.deepEqual(change(change(initial,true,'2026-01-03'),false,'2026-01-03').periods,[]);
});

test('invalid states, dates and request values cannot rewrite pause history', () => {
  for (const value of ['broken',{}, {revision:-1,periods:[]}, {revision:1,periods:[{startDate:'2026-02-30',endDate:null}]},
    {revision:1,periods:[{startDate:'2026-01-03',endDate:null},{startDate:'2026-01-04',endDate:null}]}]) assert.throws(()=>parseStudentPlanPause(value),{status:422});
  assert.throws(()=>changeStudentPlanPause(parseStudentPlanPause(),{paused:'false',revision:0,date:'2026-01-01'}),{status:422});
  const paused = change(parseStudentPlanPause(),true,'2026-01-03');
  assert.throws(()=>change(paused,false,'2026-01-02'),{status:422});
  assert.deepEqual(studentPlanPauseHolidays(paused,'2026-01-07'),[{startDate:'2026-01-03',endDate:'2026-01-07'}]);
});

test('pauses freeze new arrears, retain earlier deficits, and overlap holidays only once', async () => {
  let pause = change(parseStudentPlanPause(),true,'2026-01-03');
  pause = change(pause,false,'2026-01-08');
  const db = calendar(pause,[{startDate:'2026-01-05',endDate:'2026-01-09'}]);
  assert.deepEqual(await planScheduleDates(db,'2026-01-01','2026-01-10',allDays),['2026-01-01','2026-01-02','2026-01-10']);
  const plan = {startDate:'2026-01-01',startSurah:2,startAyah:1,endSurah:2,endAyah:286,dailyPages:1};
  const options = {plan,acceptedRanges:[],workDays:allDays};
  const before = await forecastQuranPlan(db,{...options,today:'2026-01-02'});
  const stopped = await forecastQuranPlan(db,{...options,today:'2026-01-07'});
  const resumed = await forecastQuranPlan(db,{...options,today:'2026-01-10'});
  assert.equal(before.delayedFaces,2);
  assert.equal(stopped.delayedFaces,before.delayedFaces);
  assert.equal(resumed.delayedFaces,3);
  assert.equal(stopped.projectedEndDate,before.projectedEndDate);
  const withoutPause = await forecastQuranPlan(calendar(parseStudentPlanPause(),[{startDate:'2026-01-05',endDate:'2026-01-09'}]),{...options,today:'2026-01-02'});
  assert.ok(stopped.projectedEndDate>withoutPause.projectedEndDate);
  assert.equal(isStudentStudyHoliday('2026-01-07',{planPause:pause}),true);
  assert.equal(isStudentStudyHoliday('2026-01-08',{planPause:pause}),false);
});

test('a stopped week contributes no missing program, session, attendance or reading grades', async () => {
  let pause = change(parseStudentPlanPause(),true,'2026-01-04');
  pause = change(pause,false,'2026-01-11');
  const [row] = await loadExpectedGrades(calendar(pause),{from:'2026-01-04',to:'2026-01-10',today:'2026-01-10',policy:normalizeGradingPolicy()});
  for (const key of ['programMax','trackMax','weeklyMax','attendanceDays','readingDays']) assert.equal(row[key],0);
  assert.equal(studentHomePlan({date:'2026-01-05',isPlanPaused:true,tasks:[]},'2026-01-05').planPaused,true);
});
