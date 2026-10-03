import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeasonalHolidays, isSeasonalHoliday } from '../shared/seasonal-holidays.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';
import { forecastQuranPlan, remainingPlanFaces } from '../server/services/quranPlanForecast.js';
import { assertStudyDate, studyDateSql } from '../server/services/seasonalHolidays.js';
import { loadExpectedGrades } from '../server/services/expectedGrades.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { computeWeeklyGrade } from '../shared/grading-engine.js';
import { shiftDateOnly } from '../shared/business-date.js';

const calendar = holidays => ({query:async sql => [sql.includes('AS holidays') ? [{holidays:JSON.stringify(holidays)}] : []]});
const allDays = [0,1,2,3,4,5,6];

test('seasonal holiday ranges are inclusive, allow overlaps and reject invalid dates and reversed ranges', async () => {
  const holidays = normalizeSeasonalHolidays([{startDate:'2026-10-04',endDate:'2026-10-07'},{startDate:'2026-10-01',endDate:'2026-10-05'}]);
  for (const date of ['2026-10-01','2026-10-04','2026-10-07']) assert.ok(isSeasonalHoliday(date, holidays));
  assert.equal(isSeasonalHoliday('2026-10-08',holidays),false);
  for (const value of [null,{},'bad',[{startDate:'2026-02-30',endDate:'2026-03-01'}],[{startDate:'2026-10-03',endDate:'2026-10-01'}]]) {
    assert.throws(()=>normalizeSeasonalHolidays(value),{status:422});
  }
  const dates = await planScheduleDates(calendar(holidays),'2026-10-01','2026-10-09',allDays);
  assert.deepEqual(dates,['2026-10-08','2026-10-09']);
  await assert.rejects(assertStudyDate(calendar(holidays),'2026-10-07'),{status:422});
  await assertStudyDate(calendar(holidays),'2026-10-08');
  assert.throws(()=>studyDateSql('task_date; DROP TABLE students'));
});

test('100 study days plus ten seasonal days end after 110 inclusive calendar days without double-counting overlaps', async () => {
  const plan = {startDate:'2026-01-01',startSurah:2,startAyah:1,endSurah:2,endAyah:286};
  plan.dailyPages = remainingPlanFaces(plan,[])/100;
  const holidays = [{startDate:'2026-02-01',endDate:'2026-02-10'},{startDate:'2026-02-04',endDate:'2026-02-07'}];
  const before = {plan, acceptedRanges:[],today:'2025-12-31',workDays:allDays};
  const result=await forecastQuranPlan(calendar(holidays),before);
  assert.equal(result.baseEndDate,shiftDateOnly(plan.startDate,109));
  assert.equal(result.projectedEndDate,result.baseEndDate);
  assert.equal(result.paceStatus,'on_track');
  assert.equal(result.delayedFaces,0);
  assert.equal((await forecastQuranPlan(calendar([]),before)).baseEndDate,shiftDateOnly(plan.startDate,99));
});

test('actual forecasts move with accepted work while baseline is stable; duplicates and prior memorization never count twice', async () => {
  const plan={startDate:'2026-01-01',startSurah:2,startAyah:1,endSurah:2,endAyah:286,dailyPages:1};
  const db=calendar([{startDate:'2026-01-03',endDate:'2026-01-05'}]);
  const options={plan,today:'2026-01-10',workDays:allDays};
  const missed=await forecastQuranPlan(db,{...options,acceptedRanges:[]});
  assert.equal(missed.delayedFaces,7);assert.equal(missed.paceStatus,'behind');
  assert.ok(missed.projectedEndDate>missed.baseEndDate);
  const done={startSurah:2,startAyah:1,endSurah:2,endAyah:141};
  const extra=await forecastQuranPlan(db,{...options,acceptedRanges:[done,done]});
  assert.equal(extra.baseEndDate,missed.baseEndDate);assert.equal(extra.paceStatus,'ahead');
  assert.ok(extra.projectedEndDate<extra.baseEndDate);
  assert.deepEqual(extra,await forecastQuranPlan(db,{...options,acceptedRanges:[done]}));
  const prior=await forecastQuranPlan(db,{...options,priorRanges:[done],acceptedRanges:[done]});
  assert.equal(prior.completedFaces,0);assert.ok(prior.baseEndDate<missed.baseEndDate);
});

test('a holiday longer than the original forecast window still yields a valid completion date', async () => {
  const plan={startDate:'2026-01-01',startSurah:1,startAyah:1,endSurah:1,endAyah:7,dailyPages:1};
  const result=await forecastQuranPlan(calendar([{startDate:'2026-01-01',endDate:'2028-12-31'}]),{plan,acceptedRanges:[],today:'2025-12-31',workDays:allDays});
  assert.equal(result.baseEndDate,'2029-01-01');assert.equal(result.projectedEndDate,'2029-01-01');
});

test('a whole seasonal week has no grade, session or attendance denominator; a partial week excludes only its holiday days', async () => {
  const policy=normalizeGradingPolicy();
  const days=allDays.map(weekday=>({date:shiftDateOnly('2026-10-04',weekday),weekday,seasonalHoliday:true}));
  const grade=computeWeeklyGrade(policy,{days,today:'2026-10-10'});
  assert.equal(grade.max,0);assert.equal(grade.total,0);
  const db={student:()=> '1=1',query:async sql=>{
    if(sql.includes('AS holidays'))return [[{holidays:JSON.stringify([{startDate:'2026-10-04',endDate:'2026-10-10'}])}]];
    if(sql.includes('FROM students'))return [[{id:1,joined:'2020-01-01'}]];
    return [[]];
  }};
  const [row]=await loadExpectedGrades(db,{from:'2026-10-04',to:'2026-10-10',today:'2026-10-10',policy});
  assert.equal(row.programMax,0);assert.equal(row.trackMax,0);assert.equal(row.weeklyMax,0);assert.equal(row.attendanceDays,0);assert.equal(row.readingDays,0);
  days[0].seasonalHoliday=false;
  assert.equal(computeWeeklyGrade(policy,{days,today:'2026-10-10'}).max,78);
});

test('a continued plan retains its scheduled rate-change anchor while holidays pause its new rate', async () => {
  const anchor={startSurah:2,startAyah:1,endSurah:2,endAyah:141};
  const plan={startDate:'2026-01-01',effectiveFrom:'2026-02-01',startSurah:2,startAyah:1,endSurah:2,endAyah:286,dailyPages:1,scheduleAnchorSurah:2,scheduleAnchorAyah:141};
  const holidays=[{startDate:'2026-02-01',endDate:'2026-02-10'}];
  const result=await forecastQuranPlan(calendar(holidays),{plan,acceptedRanges:[anchor],today:'2026-02-10',workDays:allDays});
  assert.equal(result.paceStatus,'on_track');
  assert.equal(result.projectedEndDate,result.baseEndDate);
  assert.equal(result.baseEndDate,shiftDateOnly('2026-02-11',Math.ceil(remainingPlanFaces(plan,[anchor]))-1));
});
