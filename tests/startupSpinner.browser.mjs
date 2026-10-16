import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright';
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5192';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out = 'outputs/startup-review';
await mkdir(out,{recursive:true});
const results=[];
const behaviorOnly=process.env.STARTUP_TEST_SCOPE==='behavior';
async function setup(browser,viewport,role='',reducedMotion='no-preference') {
 const context=await browser.newContext({viewport,reducedMotion,serviceWorkers:'block'});
 const errors=[],writes=[];
 await context.addInitScript(({role})=>{
  if(role) for(const [key,value] of Object.entries({wajeh_role:role,wajeh_account_id:'991',wajeh_student_id:'991',wajeh_supervisor_id:'991',wajeh_name:'حساب الاختبار',wajeh_dashboard_permissions:'["reports"]',nukhab_web_session:'1'})) globalThis.localStorage.setItem(key,value);
  globalThis.startupSamples=[]; globalThis.startupNode=null;
  const sample=()=>{
   const boot=globalThis.document.getElementById('startup-splash');
   if(boot&&!globalThis.startupNode)globalThis.startupNode=boot;
   globalThis.startupSamples.push({boot:!!boot,same:!boot||boot===globalThis.startupNode,loaders:globalThis.document.querySelectorAll('[data-loading-indicator="screen"]').length,logos:globalThis.document.querySelectorAll('.startup-splash').length,active:globalThis.document.documentElement.dataset.startupActive==='true'});
   globalThis.requestAnimationFrame(sample);
  }; globalThis.requestAnimationFrame(sample);
 },{role});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path.includes('/api/')) {
   if(route.request().method()!=='GET'&&!/\/offline-(recitation|student)\/bootstrap$/.test(path))writes.push(path);
   const settings={staffAttendanceSource:'supervisor',reportsSectionEnabled:true,learningPathsEnabled:true,hasStudentQuranExecution:true,storeEnabled:true,pointsSystemEnabled:true};
   let json=[];
   if(path.endsWith('/site-config'))json={};
   if(path.endsWith('/student-news'))json={entries:[]};
   if(path.endsWith('/health'))json={ok:true};
   if(path.endsWith('/settings')||path.endsWith('/public-settings'))json=settings;
   if(path.endsWith('/dashboard-bootstrap'))json={settings,permissions:['reports']};
   if(path.endsWith('/reports/overview'))json={period:{from:'2026-10-01',to:'2026-10-16'},totals:{familiesCount:12},grades:{}};
   if(path.endsWith('/quran-today'))json={plan:null,tasks:[],todayAmounts:[]};
   if(path.endsWith('/quran-sessions'))json={rows:[],points:{total:12,days:[]}};
   return route.fulfill({json});
  }
  if(url.origin!==new URL(base).origin)return route.abort();
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>{ errors.push(error.message); globalThis.console.error('Browser error:',error.message); });
 return {context,page,errors,writes};
}
async function finished(page) {
 await page.waitForFunction(()=>globalThis.document.documentElement.classList.contains('app-ready')).catch(async error=>{ await page.screenshot({path:`${out}/last-failure.png`}); globalThis.console.error(page.url(),await page.locator('body').innerText()); throw error; });
 await page.locator('#startup-splash').waitFor({state:'detached'});
 assert.equal(await page.locator('#app-root').getAttribute('inert'),null);
 assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
}
for(const [engine,type] of Object.entries({chromium,webkit})) {
 const browser=await type.launch();
 try {
  for(const viewport of (process.env.STARTUP_TEST_ROLE||behaviorOnly) ? [] : [{width:320,height:640},{width:390,height:844},{width:1440,height:900},{width:844,height:390}]) {
   const {context,page,errors,writes}=await setup(browser,viewport);
   let release;const gate=new Promise(resolve=>{release=resolve;});
   await page.route('**/src/main.jsx*',async route=>{await gate;await route.continue();});
   await page.goto(base,{waitUntil:'commit'});
   await page.waitForFunction(()=>globalThis.nukhabStartup?.active);
   await page.waitForTimeout(2200);
   const boot=page.locator('#startup-splash');
   assert.equal(await boot.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
   assert.equal(await boot.locator('.startup-brand').evaluate(el=>globalThis.getComputedStyle(el).opacity),'1');
   assert.equal(await page.locator('.loading-logo').count(),0);
   assert.equal(await page.locator('#app-root').getAttribute('inert'),'');
   // WebKit waits for document.fonts.ready until the intentionally blocked module finishes.
   if(engine==='chromium')await page.screenshot({path:`${out}/held-${engine}-${viewport.width}.png`});
   release();await finished(page);
   await page.getByLabel('رقم الدخول',{exact:true}).waitFor();
   const samples=await page.evaluate(()=>globalThis.startupSamples);
   assert.ok(samples.every(s=>s.same&&s.logos<=1&&(!s.active||s.loaders===0)),'One retained animation, no spinner phase');
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   await page.evaluate(()=>{globalThis.history.pushState(null,'','/login');globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));});
   await page.getByLabel('رقم الدخول',{exact:true}).waitFor();
   assert.equal(await page.locator('.startup-splash').count(),0);
   await page.screenshot({path:`${out}/ready-${engine}-${viewport.width}.png`});
   results.push({engine,viewport,scenario:'slow-bundle-single-animation-navigation',passed:true});
   globalThis.console.info(engine,viewport.width,'single animation passed');
   await context.close();
  }
  for(const role of behaviorOnly ? [] : process.env.STARTUP_TEST_ROLE ? [process.env.STARTUP_TEST_ROLE] : ['manager','student','supervisor']) {
   const {context,page,errors,writes}=await setup(browser,{width:390,height:844},role);
   await page.goto(role==='supervisor'?`${base}/portal/recitation-sessions`:role==='manager'?`${base}/dashboard/reports`:base);
   await finished(page);
   assert.equal(await page.locator('.account-login-form').count(),0);
   assert.equal(await page.evaluate(()=>globalThis.localStorage.getItem('wajeh_role')),role);
   assert.equal(await page.locator('[data-loading-indicator="screen"]').count(),0);
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   await page.screenshot({path:`${out}/session-${engine}-${role}.png`});
   results.push({engine,role,scenario:'restored-session',passed:true});
   globalThis.console.info(engine,role,'restored session passed');
   await context.close();
  }
  if(!process.env.STARTUP_TEST_ROLE&&!behaviorOnly) {
   const {context,page,errors}=await setup(browser,{width:390,height:844},'','reduce');
   await page.goto(base);await finished(page);
   assert.equal(await page.evaluate(()=>globalThis.document.getAnimations().some(a=>/startup/.test(a.animationName||''))),false);
   assert.deepEqual(errors,[]);results.push({engine,scenario:'reduced-motion',passed:true});await context.close();
  }
  for(const failure of (process.env.STARTUP_TEST_ROLE||behaviorOnly) ? [] : ['bundle','logo']) {
   const {context,page}=await setup(browser,{width:390,height:844});let available=false;
   await page.route(failure==='bundle'?'**/src/main.jsx*':'**/nukhab-white-640.webp*',route=>available?route.continue():route.abort());
   await page.goto(base,{waitUntil:'load'});
   await page.waitForFunction(()=>!!globalThis.nukhabStartup);
   const retry=page.locator('[data-startup-recovery]').getByRole('button',{name:'إعادة المحاولة'});
   await retry.waitFor();assert.equal(await page.evaluate(()=>globalThis.nukhabStartup.active),true);
   assert.equal(await page.locator('#app-root').getAttribute('inert'),'');
   await retry.focus();assert.equal(await retry.evaluate(el=>el===globalThis.document.activeElement),true);
   await page.screenshot({path:`${out}/failure-${engine}-${failure}.png`});
   available=true;
   if(failure==='bundle')await Promise.all([page.waitForNavigation({waitUntil:'load'}),retry.click()]);
   else await retry.click();
   await page.waitForFunction(()=>!!globalThis.document.querySelector('.account-login-form'));
   await finished(page);
   results.push({engine,scenario:`${failure}-failure-retry`,passed:true});await context.close();
  }
  if(!process.env.STARTUP_TEST_ROLE&&!behaviorOnly) {
   const {context,page}=await setup(browser,{width:390,height:844});
   await page.route('**/AccountLoginPage.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'throw new Error("startup-test-render-failure");'}));
   await page.goto(base);await finished(page);
   await page.getByText('تعذر فتح الصفحة',{exact:true}).waitFor();
   await page.getByRole('button',{name:'تحديث',exact:true}).waitFor();
   results.push({engine,scenario:'react-error-boundary',passed:true});await context.close();
  }

  if(!process.env.STARTUP_TEST_ROLE) {
   const {context,page,errors,writes}=await setup(browser,{width:390,height:844},'manager');
   let release,reports=0;const gate=new Promise(resolve=>{release=resolve;});
   await page.route('**/reports/overview*',async route=>{reports++;await gate;await route.fulfill({json:{period:{from:'2026-10-01',to:'2026-10-16'},totals:{familiesCount:12},grades:{}}});});
   await page.goto(`${base}/dashboard/reports`);
   await page.waitForTimeout(2300);
   assert.equal(await page.evaluate(()=>globalThis.nukhabStartup.active),true);
   assert.equal(await page.locator('.startup-brand').evaluate(el=>globalThis.getComputedStyle(el).opacity),'1');
   assert.equal(await page.locator('[data-loading-indicator="screen"]').count(),0);
   await page.screenshot({path:`${out}/slow-data-${engine}.png`});
   release();await finished(page);
   await page.getByRole('region',{name:'مؤشرات الأداء',exact:true}).waitFor();
   assert.equal(reports,1);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   results.push({engine,scenario:'slow-data-hold-and-complete-without-replay',passed:true});await context.close();
  }
  if(!process.env.STARTUP_TEST_ROLE) {
   const {context,page,errors,writes}=await setup(browser,{width:390,height:844});
   let logins=0;
   await page.route('**/auth/login',async route=>{
    logins++;assert.deepEqual(route.request().postDataJSON(),{loginNumber:'991',password:'test-only'});
    await route.fulfill(logins===1?{status:401,json:{message:'بيانات الدخول غير صحيحة'}}:{json:{role:'manager',id:991,name:'حساب الاختبار',dashboardPermissions:['reports']}});
   });
   await page.goto(base);await finished(page);
   await page.getByLabel('رقم الدخول',{exact:true}).fill('991');
   await page.getByLabel('كلمة المرور',{exact:true}).fill('test-only');
   await page.getByRole('button',{name:'تسجيل دخول',exact:true}).click();
   await page.getByText('بيانات الدخول غير صحيحة',{exact:true}).waitFor();
   await page.waitForFunction(()=>!globalThis.document.querySelector('[data-loading-indicator="screen"]'));
   assert.equal(await page.evaluate(()=>globalThis.localStorage.getItem('wajeh_role')),null);
   assert.equal(await page.locator('.dashboard-header').count(),0);
   assert.equal(await page.locator('.startup-splash').count(),0);
   await page.getByRole('button',{name:'تسجيل دخول',exact:true}).click();
   await page.waitForURL(/\/dashboard/);
   await page.locator('[data-loading-indicator="screen"]').waitFor({state:'hidden'});
   await page.evaluate(()=>globalThis.dispatchEvent(new globalThis.Event('focus')));
   assert.equal(await page.locator('.startup-splash').count(),0);
   assert.equal(logins,2);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   results.push({engine,scenario:'login-401-success-no-duplicate-or-replay',passed:true});await context.close();
  }
 } finally {await browser.close();}
}
await writeFile(`${out}/${behaviorOnly ? "behavior-validation" : "browser-validation"}.json`,JSON.stringify({checkedAt:new Date().toISOString(),cases:results.length,physicalDevice:false,results},null,2));
globalThis.console.info(`Startup: ${results.length} Chromium/WebKit cases passed; isolated APIs.`);
