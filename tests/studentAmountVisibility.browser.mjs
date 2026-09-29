import console from 'node:console';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { studentVisibleToday } from '../shared/student-amount-visibility.js';
const browser=await chromium.launch();
try {
 for(const width of [360,768,1440]) for(const hidden of ['memorization','review','link','all']) {
  const page=await browser.newPage({viewport:{width,height:900}});let submitted=false;
  const tasks=['memorization','review','link'].map((taskType,i)=>({id:i+1,taskType,fromPage:1,toPage:3,fromSurah:1,toSurah:1,fromAyah:1,toAyah:3,preview:`مقدار-${taskType}`}));
  const settings={hideStudentAmounts:true,hideStudentMemorizationAmount:['all','memorization'].includes(hidden),hideStudentReviewAmount:['all','review'].includes(hidden),hideStudentLinkAmount:['all','link'].includes(hidden)};
  await page.route('**/api/**',route=>{
   if(route.request().method()==='POST'){assert.equal(route.request().postDataJSON().actualEnd,null);submitted=true;}
   const data={plan:{track:'memorization'},tasks:tasks.map(task=>({...task,studentStatus:submitted?'done':'not_done',actualPreview:submitted?`سر-${task.taskType}`:null})),executionSources:{memorization:'student',review:'student',link:'student'}};
   return route.fulfill({json:studentVisibleToday(data,settings,'student')});
  });
  await page.goto('http://127.0.0.1:3003/tests/fixtures/student-execution-range.html');
  await page.getByRole('button',{name:'حفظ',exact:true}).waitFor();
  for(const task of tasks) assert.equal(await page.getByText(task.preview,{exact:true}).count(),hidden==='all'||hidden===task.taskType?0:1);
  const _resolveButton = () => {
    if (hidden==='review') {
      return 'مراجعة';
    }
    if (hidden==='link') {
      return 'ربط';
    }
    return 'حفظ';
  };
  const button=_resolveButton();
  const refreshed = page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/'));
  await page.getByRole('button',{name:button,exact:true}).click();
  await refreshed;
  for(const task of tasks.filter(t=>hidden==='all'||hidden===t.taskType)) assert.equal(await page.getByText(`سر-${task.taskType}`,{exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));await page.close();
 }
 console.log('Home card execution and selective amount hiding passed at 360/768/1440px.');
} finally {await browser.close();}
