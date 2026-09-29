import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch();
try {
 for(const width of [360,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:33471')+'/tests/fixtures/narration-count.html');
  await page.getByRole('button',{name:'بدء',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'النتيجة',exact:true}).count(),0);
  const chooseCount=async(label='بدأ التسميع')=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'تسجيل عدد الأخطاء والتنبيهات',exact:true}).click();};
  // Two separate segments of juz 5 are listed under one juz with a single grade.
  assert.equal(await page.getByRole('list',{name:'مقاطع الجزء 5'}).getByRole('listitem').count(),2);
  assert.equal(await page.getByRole('button',{name:'بدأ التسميع',exact:true}).count(),1);
  await chooseCount();
  const warnings=page.getByRole('spinbutton',{name:'عدد التنبيهات'});
  const mistakes=page.getByRole('spinbutton',{name:'عدد الأخطاء'});
  await page.getByRole('button',{name:'زيادة عدد التنبيهات'}).click();
  await page.getByRole('button',{name:'زيادة عدد التنبيهات'}).click();
  await page.getByRole('button',{name:'إنقاص عدد التنبيهات'}).click();
  assert.equal(await warnings.inputValue(),'1');
  await mistakes.fill('4');await mistakes.press('Tab');
  assert.equal(await mistakes.inputValue(),'4');
  await page.getByRole('button',{name:'حفظ',exact:true}).click();
  await page.waitForFunction(()=>globalThis.narrationFixture.saves.length===1);
  assert.deepEqual(await page.evaluate(()=>globalThis.narrationFixture.saves[0]),{entryId:4,juzNumber:5,evaluationMode:'count',warningCount:1,mistakeCount:4});
  assert.equal(await page.locator('section[aria-label="الجزء 5"]').getByText('90.0 من 100',{exact:true}).count(),1);
  await chooseCount('بدأ التسميع');assert.equal(await mistakes.inputValue(),'4');
  await page.getByRole('button',{name:'إنقاص عدد التنبيهات'}).click();await page.getByRole('button',{name:'إنقاص عدد التنبيهات'}).click();assert.equal(await warnings.inputValue(),'0');
  await page.evaluate(()=>{globalThis.narrationFixture.fail=true;});await page.getByRole('button',{name:'حفظ',exact:true}).click();assert.equal(await mistakes.inputValue(),'4');
  const dialog=page.getByRole('dialog').last();await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:'outputs/narration-count-'+width+'.png'});
  await page.getByRole('button',{name:'إغلاق',exact:true}).click();
  await page.getByRole('button',{name:'بدأ التسميع',exact:true}).click();await page.getByRole('button',{name:'المصحف',exact:true}).click();
  await page.waitForFunction(()=>globalThis.narrationFixture.loads.length>=2);
  assert.deepEqual(await page.evaluate(()=>globalThis.narrationFixture.loads.map(item=>item.partId).sort()),[51,52]);
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
globalThis.console.log('Narration per-juz grading, method selection, count editing, saving, reopening, failure retention and Mushaf routing passed at 360/768/1440px.');
