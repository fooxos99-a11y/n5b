import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassingReport } from '../shared/passing-report.js';

const attempt = (id,score,maxScore=100,ratings=[{label:'مرتفع',minimumPercentage:90},{label:'أقل',minimumPercentage:0}]) =>
  ({id,result:{score,maxScore,passed:score/maxScore>=.85},policy:{ratings},actorName:'مقرئ',marks:[]});
const exam = (id,type,juzNumber,attempts) => ({id,type,parts:[{juzNumber,attempts}]});
test('report counts latest attempt per juz across exams and types, keeping every prior attempt', () => {
  const report=buildPassingReport([exam(1,'branch',1,[attempt(1,50)]),exam(2,'branch',1,[attempt(2,90)]),exam(3,'hafiz',2,[attempt(3,16,20)]),exam(4,'hafiz',1,[attempt(4,100)])],Array(5).fill({}));
  assert.deepEqual(report.summary,{percentage:90,rating:'مرتفع',testedParts:2,passedParts:1,attemptCount:4,memorizedParts:5});
  assert.deepEqual(report.parts[0].attempts.map(row=>[row.id,row.type]),[[4,'hafiz'],[2,'branch'],[1,'branch']]);
  assert.equal(report.parts[0].latestAttempt.id,4);
});
test('overall uses equal juz weights, skips untested juz, and freezes the newest attempt rating scale', () => {
  const exams=[exam(1,'branch',1,[attempt(1,100,100)]),exam(2,'branch',2,[attempt(2,16,20,[{label:'مقياس محفوظ',minimumPercentage:0}])]),exam(3,'hafiz',3,[])];
  const before=JSON.stringify(exams),report=buildPassingReport(exams,Array(30).fill({}));
  assert.equal(report.summary.percentage,90);
  assert.equal(report.summary.rating,'مقياس محفوظ');
  assert.equal(report.summary.testedParts,2);
  assert.equal(JSON.stringify(exams),before,'building a report does not mutate history or settings');
});
test('empty and legacy reports show no invented ratings', () => {
  assert.deepEqual(buildPassingReport([]).summary,{percentage:null,rating:null,testedParts:0,passedParts:0,attemptCount:0,memorizedParts:0});
  const legacy=attempt(1,93);delete legacy.policy.ratings;
  assert.equal(buildPassingReport([exam(1,'branch',1,[legacy])]).summary.rating,null);
  assert.equal(buildPassingReport([exam(1,'branch',1,[legacy])]).summary.percentage,93);
});
