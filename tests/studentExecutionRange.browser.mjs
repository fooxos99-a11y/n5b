import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
 for (const width of [360,768,1440]) {
  const page = await browser.newPage({viewport:{width,height:900}});
  const tasks = ['memorization','review','link'].map((taskType,i)=>({id:i+1,taskType,fromPage:1,toPage:3,fromSurah:1,toSurah:1,fromAyah:1,toAyah:3,preview:'من 1 إلى 3'}));
  const sent=[];
  await page.route('**/api/**', route=>{
   if(route.request().method()==='POST')sent.push(route.request().postDataJSON());
   return route.fulfill({json:{plan:{startSurah:1,endSurah:1,startAyah:1,endAyah:3},tasks,executionAyahs:[1,2,3].map(page=>({page,surah:1,ayah:page})),executionSources:{memorization:'student',review:'student',link:'student'}}});
  });
  await page.goto('http://127.0.0.1:3003/tests/fixtures/student-execution-range.html');
  const selectors=page.getByRole('combobox',{name:'صفحة النهاية'});
  await selectors.first().waitFor();assert.equal(await selectors.count(),3);
  await selectors.first().click();await page.getByRole('option',{name:'2',exact:true}).click();
  await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'),page.getByRole('button',{name:'حفظ',exact:true}).click()]);
  assert.equal(sent[0].actualEnd.page,2);
  assert.ok(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
  await page.screenshot({path:`outputs/student-execution-range-${width}.png`});await page.close();
 }
}finally{await browser.close()}
