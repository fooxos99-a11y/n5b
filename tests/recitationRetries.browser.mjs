import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

const origin = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3011';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
await mkdir('outputs', { recursive:true });
const previous = '018f47f0-a321-4a2f-8abc-1234567890ab';
const policy = normalizeGradingPolicy({});
const date = getBusinessDate();
const makeTask = (type,id) => ({id,studentId:99,studentName:'طالب اختبار الإعادة',planId:1,planVersion:1,taskDate:date,taskType:type,
  track:'memorization',fromPage:2,toPage:2,fromSurah:2,fromAyah:1,toSurah:2,toAyah:5,targetPages:1,teacherCompleted:true,retryOf:previous,attemptCount:1});
const initial = () => ({date,tasks:[makeTask('memorization',1),makeTask('review',2),makeTask('link',3)],
  students:[{studentId:99,studentName:'طالب اختبار الإعادة',attendanceStatus:'present'}],
  evaluationModes:{memorization:'count',review:'count',link:'count'},executionSources:{memorization:'teacher',review:'teacher',link:'teacher'},gradingPolicy:policy});
const results = [];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch();
  try {
    for(const width of [320,390,1440]) {
      console.log(`Checking ${name} at ${width}`);
      const context = await browser.newContext({viewport:{width,height:900},hasTouch:true,serviceWorkers:'block'});
      const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      let data=initial(); let release; const submissions=[];
      let legacyServer=false, individualWrites=0;
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role','supervisor'); globalThis.localStorage.setItem('wajeh_supervisor_id','990'); globalThis.localStorage.setItem('nukhab_web_session','1');
        Object.defineProperty(globalThis.navigator,'onLine',{configurable:true,get:()=>globalThis.localStorage.getItem('retry-test-offline')!=='1'});
      });
      await context.route('**/api/**',async route=>{
        const path=new URL(route.request().url()).pathname;
        if(path.endsWith('/quran-evaluation')) return route.fulfill({json:{...data,taskQueue:data.tasks}});
        if(path.endsWith('/chapters')) return route.fulfill({json:[]});
        if(path.endsWith('/offline-recitation/batch')) {
          if(legacyServer) return route.fulfill({status:404,json:{message:'Legacy test server'}});
          const batch=route.request().postDataJSON().sessions; submissions.push(...batch);
          await new Promise(resolve=>{release=resolve;});
          for(const session of batch) data={...data,tasks:data.tasks.map(task=>session.tasks.some(item=>item.taskId===task.id)?{...task,retryOf:session.sessionId}:task)};
          return route.fulfill({json:{results:batch.map(session=>({sessionId:session.sessionId,result:'accepted',tasks:session.tasks.map(item=>({taskId:item.taskId,result:'accepted',data:{ok:true,teacherCompleted:true,evaluationScore:90}}))}))}});
        }
        if(/\/quran-evaluation\/\d+$/.test(path) && route.request().method()==='POST') individualWrites++;
        return route.fulfill({json:{}});
      });
      await page.goto(origin+'/tests/fixtures/recitation-policy.html');
      for(const label of ['حفظ','مراجعة','ربط']) {
        const button=page.getByRole('button',{name:`إعادة تسميع ${label}`,exact:true}); await button.waitFor();
        const box=await button.boundingBox(); assert.ok(box.height>=44); assert.equal(await button.locator('svg').count(),1);
      }
      await page.getByRole('button',{name:'إعادة تسميع حفظ',exact:true}).click();
      await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).waitFor();
      assert.equal(await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).inputValue(),'0');
      await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).fill('4');
      let draftSaved=false;
      for(let attempt=0;attempt<100;attempt++) {
        if(await page.evaluate(async key=>(await globalThis.recitationFixture.store.getDraft('default:supervisor:990',key))?.itemCounts?.['1']?.mistakeCount,`99:${date}:1:${previous}`)===4){draftSaved=true;break;}
        await new Promise(resolve=>globalThis.setTimeout(resolve,25));
      }
      assert.ok(draftSaved,'The draft is durably saved before closing');
      await page.getByRole('button',{name:'إغلاق',exact:true}).click(); assert.equal(submissions.length,0,'Cancel does not submit');
      await page.getByRole('button',{name:'إعادة تسميع مراجعة',exact:true}).click();
      assert.equal(await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).inputValue(),'0','Another type does not inherit the draft');
      await page.getByRole('button',{name:'إغلاق',exact:true}).click();
      const kept = await page.evaluate(async key=>(await globalThis.recitationFixture.store.getDraft('default:supervisor:990',key))?.itemCounts?.['1']?.mistakeCount,`99:${date}:1:${previous}`);
      assert.equal(kept,4,'Closing another task preserves the first draft');
      await page.getByRole('button',{name:'إعادة تسميع حفظ',exact:true}).click();
      await page.waitForFunction(()=>globalThis.document.querySelector('[aria-label="عدد الأخطاء"][type="number"]')?.value==='4');
      await page.getByRole('button',{name:'إنهاء',exact:true}).click();
      const waiting=page.getByRole('button',{name:'إعادة تسميع حفظ، بانتظار المزامنة',exact:true}); await waiting.waitFor();
      assert.equal(await waiting.isDisabled(),true); await page.waitForFunction(()=>!globalThis.document.querySelector('[role="dialog"]'));
      const syncStarted=Date.now();
      while(!release) {assert.ok(Date.now()-syncStarted<10000,'The saved session starts synchronizing');await new Promise(resolve=>globalThis.setTimeout(resolve,20));}
      assert.equal(submissions.length,1); assert.equal(submissions[0].retryOf,previous); assert.equal(submissions[0].tasks[0].payload.mistakeCount,4);
      await page.screenshot({path:`outputs/recitation-retry-pending-${name}-${width}.png`});
      release(); release=null;
      await page.getByRole('button',{name:'إعادة تسميع حفظ',exact:true}).waitFor();
      assert.equal(await page.getByText('طالب اختبار الإعادة',{exact:true}).count(),1);
      await page.getByRole('button',{name:'إعادة تسميع حفظ',exact:true}).click();
      await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).waitFor();
      assert.equal(await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).inputValue(),'0','A new attempt starts without the last attempt draft');
      await page.getByRole('button',{name:'إغلاق',exact:true}).click();
      await page.evaluate(()=>globalThis.localStorage.setItem('retry-test-offline','1'));
      await page.getByRole('button',{name:'إعادة تسميع ربط',exact:true}).click();
      await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).waitFor();
      await page.getByRole('button',{name:'إنهاء',exact:true}).click();
      await page.getByRole('button',{name:'إعادة تسميع ربط، بانتظار المزامنة',exact:true}).waitFor();
      assert.equal(submissions.length,1,'Offline save does not issue a request');
      await page.reload();
      await page.getByRole('button',{name:'إعادة تسميع ربط، بانتظار المزامنة',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'إعادة تسميع ربط، بانتظار المزامنة',exact:true}).isDisabled(),true);
      assert.ok(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
      await page.screenshot({path:`outputs/recitation-retry-${name}-${width}.png`});
      if(width===320) {
        legacyServer=true;
        const failed=await page.evaluate(async()=>{
          globalThis.localStorage.removeItem('retry-test-offline');
          return globalThis.recitationFixture.syncOfflineRecitations(990,{force:true});
        });
        assert.ok(failed.some(session=>session.retryOf===previous && session.status==='failed' && session.lastError));
        assert.equal(individualWrites,0,'An older server cannot partially apply a retry through individual requests');
      }
      assert.deepEqual(errors,[]); results.push({engine:name,width,passed:true}); await context.close();
    }
    // The mushaf must start with new marks even when the cached API has old mistakes.
    const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
    const page=await context.newPage();
    const mushaf=JSON.parse(await readFile(new URL('../public/quran/hafs/pages/108.json',import.meta.url),'utf8'));
    const first=mushaf.words[0].location.split(':').map(Number),last=mushaf.words.at(-1).location.split(':').map(Number);
    const task={...makeTask('memorization',1),fromPage:108,toPage:108,fromSurah:first[0],fromAyah:first[1],toSurah:last[0],toAyah:last[1]};
    await context.addInitScript(()=>{globalThis.localStorage.setItem('wajeh_role','supervisor');globalThis.localStorage.setItem('wajeh_supervisor_id','990');globalThis.localStorage.setItem('nukhab_web_session','1');});
    await context.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.endsWith('/quran-evaluation')) return route.fulfill({json:{...initial(),tasks:[task],taskQueue:[task],evaluationModes:{memorization:'mushaf'}}});
      if(path.endsWith('/ayahs')) return route.fulfill({json:{pages:[mushaf],wordMarks:[{id:2,page:108,startLocation:mushaf.words[0].location,endLocation:mushaf.words[0].location,markType:'mistake'}],allowedRange:{fromSurah:first[0],fromAyah:first[1],toSurah:last[0],toAyah:last[1]}}});
      if(path.endsWith('/chapters')) return route.fulfill({json:[{number:first[0],name:'المائدة',ayahCount:120}]});
      return route.fulfill({json:{}});
    });
    await page.goto(origin+'/tests/fixtures/recitation-policy.html');
    await page.getByRole('button',{name:'إعادة تسميع حفظ',exact:true}).click();
    const surface=page.getByRole('region',{name:'جلسة التسميع'});
    await surface.locator('[data-mushaf-word-index]').first().waitFor({timeout:45000});
    assert.equal(await surface.locator('[data-highlight-tone="mistake"]').count(),0);
    await page.screenshot({path:`outputs/recitation-retry-mushaf-${name}.png`});
    await context.close();
  } finally {await browser.close();}
}
console.log(JSON.stringify({passed:true,viewports:results,mushafFreshMarks:true,offlineReload:true,draftIsolation:true}));
