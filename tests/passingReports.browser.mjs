import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import mysql from 'mysql2/promise';
import {formatPassingPercentage} from '../shared/passing-ratings.js';
import {readQuranRange} from '../server/services/quranReferenceCache.js';

const base='http://127.0.0.1:3048',folder='outputs/passing-expansion-20261021';
const entry=(await readFile('outputs/passing-entry/private-link.txt','utf8')).trim();
const {database,staffTokens}=JSON.parse(await readFile('outputs/passing-entry/preview-session.local','utf8'));
assert.equal(database,'nukhab_guest_preview_20261021');assert.ok(entry.startsWith(base+'/passing-entry/'));
await readFile(`${folder}/preview-before-expansion.local.sql`);
await mkdir(folder,{recursive:true});
const pool=mysql.createPool({host:'127.0.0.1',port:3310,user:'root',password:'',database});
const browser=await chromium.launch({headless:true});
const api=async(path,body,method=body===undefined?'GET':'POST')=>{
  const response=await globalThis.fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:`nukhab_session=${staffTokens.manager}`},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;
};
const initialPolicy=(await api('/passing/policy')).policy;
const evidence=[];
const noOverflow=async page=>{
  await page.waitForFunction(()=>globalThis.document.fonts.status==='loaded');
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
  for(const dialog of await page.getByRole('dialog').all()) {
    await dialog.evaluate(async element=>{await Promise.all(element.getAnimations().map(animation=>animation.finished));});
    assert.equal(await dialog.evaluate(element=>element.isConnected && element.scrollWidth>element.clientWidth+1),false);
  }
};
try {
  const ayahs=await readQuranRange(pool,1,604);
  for(const juz of [3,4]) {
    const rows=ayahs.filter(row=>Number(row.juz)===juz),first=rows[0],last=rows.at(-1);
    const table=juz===3?'student_quran_prior_memorization':'student_quran_plan_prior_memorization';
    const [[existing]]=await pool.query(`SELECT id FROM ${table} WHERE student_id=11 AND start_surah=? AND start_ayah=? AND end_surah=? AND end_ayah=? LIMIT 1`,[first.surah,first.ayah,last.surah,last.ayah]);
    if(!existing)await pool.query(`INSERT INTO ${table}(student_id,${juz===4?'plan_id,':''}start_page,start_surah,start_ayah,end_page,end_surah,end_ayah) VALUES(11,${juz===4?'11,':''}?,?,?,?,?,?)`,[first.page,first.surah,first.ayah,last.page,last.surah,last.ayah]);
  }
  assert.deepEqual((await api('/passing/students/11/parts?type=branch')).parts.map(row=>Number(row.juzNumber)),[1,2,3,4]);
  for(const [width,theme] of [[320,'light'],[390,'light'],[390,'dark'],[768,'light'],[1440,'light'],[1440,'dark']]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addCookies([{name:'nukhab_session',value:staffTokens.manager,url:base,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage(),errors=[],guestCookies=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('/api/passing/guest'))guestCookies.push(request.headers().cookie||'');});
    await page.addInitScript(themeValue=>{
      globalThis.localStorage.setItem('nukhab_theme_account',themeValue);globalThis.localStorage.setItem('wajeh_role','manager');
      globalThis.localStorage.setItem('wajeh_name','الإدارة المحلية');globalThis.localStorage.setItem('wajeh_supervisor_id','1');globalThis.localStorage.setItem('nukhab_web_session','1');
    },theme);
    await page.goto(entry);await page.waitForFunction(()=>!globalThis.window.nukhabStartup?.active);
    await page.getByLabel('اسم المقرئ',{exact:true}).fill(`مقرئ التقرير ${width} ${theme}`);
    await page.getByRole('button',{name:'دخول',exact:true}).click();
    await page.getByRole('button',{name:'اختبار طالب الاجتياز المحلي',exact:true}).click();
    await page.getByRole('region',{name:'الجزء 3',exact:true}).waitFor();
    await page.getByRole('region',{name:'الجزء 4',exact:true}).waitFor();
    if(width===320) {
      const part=page.getByRole('region',{name:'الجزء 3',exact:true});
      const count=async mistakes=>{
        await part.getByRole('button',{name:/بدء تسميع الجزء|إعادة اختبار الجزء|إعادة تسميع الجزء/}).click();
        await page.getByRole('button',{name:'تسجيل عدد الأخطاء والتنبيهات',exact:true}).click();
        await page.getByRole('spinbutton',{name:'عدد الأخطاء',exact:true}).fill(String(mistakes));
        await page.getByRole('button',{name:'حفظ النتيجة',exact:true}).click();
        const decision=page.getByRole('dialog',{name:'إعادة الحفظ ضمن الخطة',exact:true});await decision.waitFor();
        await decision.getByText(mistakes===4?'النسبة 80٪':'النسبة 95٪',{exact:true}).waitFor();
        await noOverflow(page);
        await decision.getByRole('button',{name:mistakes===4?'إعادة الاختبار في وقت لاحق':'إبقاء الخطة',exact:true}).click();
        await decision.waitFor({state:'hidden'});
      };
      await count(4);await count(1);
    }
    await page.getByRole('button',{name:'التقرير المجمّع',exact:true}).click();
    await page.getByRole('region',{name:'ملخص الاختبارات'}).waitFor();
    if(width===390&&theme==='dark') {
      await page.route('**/api/passing/guest/students/11/report?type=all',route=>route.abort('connectionfailed'));
    }
    await page.getByRole('combobox',{name:'نوع الاختبارات',exact:true}).click();
    await page.getByRole('option',{name:'جميع الاختبارات',exact:true}).click();
    if(width===390&&theme==='dark') {
      await page.getByText('تعذر الاتصال. تحقق من اتصالك وحاول مرة أخرى.',{exact:true}).waitFor();
      await page.unroute('**/api/passing/guest/students/11/report?type=all');
      await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();
    }
    const report=await api('/passing/students/11/report');
    await page.getByRole('region',{name:'ملخص الاختبارات'}).getByText(formatPassingPercentage(report.summary.percentage),{exact:true}).waitFor();
    const row=page.getByRole('region',{name:'نتائج الجزء 3',exact:true});
    await row.getByText('النسبة 95٪',{exact:true}).waitFor();await row.getByText('ممتاز',{exact:true}).waitFor();
    assert.equal(await page.getByRole('region',{name:'نتائج الجزء 4',exact:true}).count(),0,'untested parts do not become zero scores');
    await noOverflow(page);await page.screenshot({path:`${folder}/combined-${width}-${theme}.png`,fullPage:true});
    await page.getByRole('button',{name:'سجل الجزء 3',exact:true}).click();
    const history=page.getByRole('dialog',{name:'تقرير الجزء 3',exact:true});await history.waitFor();
    await history.getByText('النسبة 80٪',{exact:true}).last().waitFor();await history.getByText('النسبة 95٪',{exact:true}).first().waitFor();
    await history.getByText('الإعدادات المستخدمة',{exact:true}).first().click();
    await history.getByText(/التقديرات: ممتاز من 95٪/).first().waitFor();
    await noOverflow(page);await page.screenshot({path:`${folder}/history-${width}-${theme}.png`,fullPage:true});
    await history.getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.getByRole('combobox',{name:'نوع الاختبارات',exact:true}).click();await page.getByRole('option',{name:'اجتياز حافظ',exact:true}).click();
    const hafiz=await api('/passing/students/11/report?type=hafiz');
    await page.getByRole('region',{name:'ملخص الاختبارات'}).getByText(formatPassingPercentage(hafiz.summary.percentage),{exact:true}).waitFor();
    await noOverflow(page);
    assert.equal(await page.locator('header button').count(),0);assert.equal(guestCookies.some(Boolean),false);assert.deepEqual(errors,[]);
    evidence.push({width,theme,priorParts:[3,4],combinedPercentage:report.summary.percentage,reportHistory:true,overflow:false,guestCookieIsolation:true});
    await context.close();
  }
  const reportBefore=await api('/passing/students/11/report');
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await context.addCookies([{name:'nukhab_session',value:staffTokens.manager,url:base,httpOnly:true,sameSite:'Strict'}]);
  await context.addInitScript(()=>{globalThis.localStorage.setItem('wajeh_role','manager');globalThis.localStorage.setItem('wajeh_name','الإدارة المحلية');globalThis.localStorage.setItem('wajeh_supervisor_id','1');globalThis.localStorage.setItem('nukhab_web_session','1');});
  const page=await context.newPage();await page.goto(base+'/dashboard/settings-passing');await page.getByLabel('اسم التقدير 1',{exact:true}).waitFor();
  const save=()=>page.waitForResponse(response=>response.url().endsWith('/passing/policy')&&response.request().method()==='PUT');
  let saved=save();await page.getByRole('button',{name:'إضافة تقدير',exact:true}).click();assert.ok((await saved).ok());
  const index=initialPolicy.ratings.length+1;
  saved=save();await page.getByLabel(`اسم التقدير ${index}`,{exact:true}).fill('تقدير المعاينة');assert.ok((await saved).ok());
  saved=save();await page.getByLabel(`الحد الأدنى ${index} ٪`,{exact:true}).fill('97');assert.ok((await saved).ok());
  await noOverflow(page);await page.screenshot({path:`${folder}/settings-mobile.png`,fullPage:true});
  await page.reload();await page.waitForFunction(()=>[...globalThis.document.querySelectorAll('input')].some(input=>input.value==='تقدير المعاينة'));
  assert.equal((await api('/passing/policy')).policy.ratings.find(row=>row.label==='تقدير المعاينة').minimumPercentage,97);
  assert.deepEqual(await api('/passing/students/11/report'),reportBefore,'real UI settings edits preserve historical results and report ratings');
  const extraIndex=await page.locator('input[id^="passing-rating-label-"]').evaluateAll(inputs=>inputs.find(input=>input.value==='تقدير المعاينة').id.split('-').at(-1));
  saved=save();await page.getByRole('button',{name:`حذف التقدير ${Number(extraIndex)+1}`,exact:true}).click();assert.ok((await saved).ok());
  assert.equal((await api('/passing/policy')).policy.ratings.length,initialPolicy.ratings.length);
  await page.goto(base+'/dashboard/passing');await page.getByRole('button',{name:'تقرير طالب الاجتياز المحلي',exact:true}).click();
  await page.getByRole('region',{name:'ملخص الاختبارات'}).getByText(formatPassingPercentage(reportBefore.summary.percentage),{exact:true}).waitFor();
  await noOverflow(page);await page.screenshot({path:`${folder}/staff-report-mobile.png`,fullPage:true});
  await context.close();evidence.push({settingsPersistence:true,historicalResultsPreserved:true,staffReport:true});
  await writeFile(`${folder}/browser-report.json`,JSON.stringify(evidence,null,2));
  globalThis.console.log(`Passing reports real browser/API: ${evidence.length} scenarios passed; prior juz testing/retake, combined and per-juz percentages, histories, filters, saved settings, retry, mobile/desktop light/dark, and guest isolation verified.`);
} finally {await api('/passing/policy',{policy:initialPolicy},'PUT');await browser.close();await pool.end();}
