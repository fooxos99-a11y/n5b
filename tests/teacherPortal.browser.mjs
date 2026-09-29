import process from 'node:process';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true});const results=[];
await mkdir('outputs',{recursive:true});
try{
for(const width of [360,768,1440]){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
 const students=Array.from({length:4},(_,i)=>({studentId:990+i,studentName:`طالب تجريبي ${i+1}`,attendanceStatus:'present',canSetAttendance:true}));
 const fixture={date:'2026-09-06',students,tasks:students.map((student,i)=>({...student,id:900+i,taskType:'memorization',track:i%2?'mastery':'memorization',fromPage:3,toPage:3,fromSurah:2,toSurah:2,fromAyah:6,toAyah:16,fromSurahName:'البقرة',toSurahName:'البقرة',targetPages:1,teacherCompleted:null,expectedRepeatCount:10,expectedListeningCount:3,actualRepeatCount:10,actualListeningCount:3})),executionSources:{memorization:'student',review:'student',link:'student'},listeningEnabled:true};
 let preferences={memorizationMode:'mushaf',masteryMode:'mushaf',reviewMode:'mushaf',linkMode:'mushaf'};const saves=[];
 const committees=[{id:2,name:'حلقة الإتقان'},{id:3,name:'حلقة التميز'}];
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let body=[];
  if(path.endsWith('/health'))body={ok:true};
  if(path.endsWith('/site-config'))body={};
  if(path.endsWith('/public-settings'))body={staffAttendanceSource:'supervisor',hasStudentQuranExecution:true};
  if(path.endsWith('/quran-evaluation'))body=fixture;
  if(path.endsWith('/recitation-preferences/me')){
   if(route.request().method()==='PUT'){preferences=route.request().postDataJSON();saves.push(preferences);}
   body=preferences;
  }
  if(path.endsWith('/students'))body=students.slice(0,2).map(s=>({id:s.studentId,name:s.studentName}));
  if(path.endsWith('/reports/student-recitation-history'))body={rows:new URL(route.request().url()).searchParams.get('studentId')==='990' ? ['memorization','link','review'].map((taskType,i)=>({...fixture.tasks[0],id:700+i,taskType,sessionDate:'2022-01-03',taskDate:'2020-01-01',mistakeCount:taskType==='review'?2:0,teacherCompleted:true})) : []};
  if(path.endsWith('/reports/committees'))body=committees;
  if(path.endsWith('/reports/overview'))body={totals:{studentsCount:4,familiesCount:2},committeeIndicators:committees};
  if(path.includes('notifications'))body={notifications:[],unreadCount:0};
  await route.fulfill({json:body});
 });
 await context.addInitScript(()=>{
  globalThis.localStorage.setItem('wajeh_role','supervisor');globalThis.localStorage.setItem('wajeh_supervisor_id','13');globalThis.localStorage.setItem('wajeh_account_id','13');globalThis.localStorage.setItem('nukhab_web_session','1');globalThis.localStorage.setItem('wajeh_dashboard_permissions','[]');
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/portal/recitation-sessions`);await page.getByText('طالب تجريبي 1',{exact:true}).waitFor();
 assert.equal(await page.locator('.dashboard-header p').count(),0,'Header contains the page title without the site name');
 await page.getByRole('button',{name:'إظهار جميع المقادير',exact:true}).click();
 await page.locator('.recitation-summary').first().waitFor();
 const boxes=await page.locator('.recitation-reference-card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 assert.equal(boxes.length,4);assert.equal(new Set(boxes.map(b=>b.x)).size,1);assert.equal(new Set(boxes.map(b=>b.y)).size,4);assert.ok(boxes.every(b=>b.height<270));
 if(width===360){
  assert.ok(boxes.every(b=>b.height<=185),'Mobile cards stay compact with all details visible');
  assert.ok(await page.locator('.recitation-actions button, .recitation-attendance').evaluateAll(es=>es.every(e=>e.offsetHeight>=44)),'Keep touch targets usable');
 }
 assert.ok(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
 const layout=await page.locator('.recitation-reference-card').first().evaluate(el=>{const rect=s=>el.querySelector(s).getBoundingClientRect();return {identity:rect('.recitation-identity').bottom,actions:rect('.recitation-actions').top,actionBottom:rect('.recitation-actions').bottom,summary:rect('.recitation-summary').top,buttons:[...el.querySelectorAll('.recitation-actions button')].map(b=>b.getBoundingClientRect().y)};});
 assert.ok(layout.actions>layout.identity && layout.summary>layout.actionBottom);assert.equal(new Set(layout.buttons).size,1);assert.equal(layout.buttons.length,1);
 assert.equal(await page.locator('.recitation-actions button:disabled').count(),0,'Missing tasks do not create disabled placeholders');
 await page.screenshot({path:`outputs/teacher-sessions-mobile-${width}.png`});
 assert.equal(await page.locator('.dashboard-header').getByRole('button',{name:/الإشعارات/}).count(),0);
 assert.equal(await page.getByRole('button',{name:'إعدادات جلسات التسميع',exact:true}).count(),1);
 const settingsStyle=await page.getByRole('button',{name:'إعدادات جلسات التسميع',exact:true}).evaluate(e=>{const s=globalThis.getComputedStyle(e);return {background:s.backgroundColor,border:s.borderWidth,shadow:s.boxShadow,iconWidth:e.querySelector('svg').getBoundingClientRect().width};});
 const {shadow,...settingsAppearance}=settingsStyle;
 assert.deepEqual(settingsAppearance,{background:'rgba(0, 0, 0, 0)',border:'0px',iconWidth:16});
 assert.match(shadow,/^(?:none|(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?:, )?)+)$/);
 await page.getByRole('button',{name:'إعدادات جلسات التسميع',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'إعدادات جلسات التسميع'});await dialog.getByRole('combobox').first().waitFor();
 assert.deepEqual(await dialog.getByRole('combobox').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),['طريقة تسميع الحفظ','طريقة تسميع المراجعة','طريقة تسميع الربط']);
 const ys=await dialog.getByRole('combobox').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));assert.ok(ys[0]<ys[1]&&ys[1]<ys[2]);
 await dialog.getByRole('combobox',{name:'طريقة تسميع الحفظ'}).click();await page.getByRole('option',{name:'العد',exact:true}).click();
 await dialog.getByText('حُفظ تلقائيًا',{exact:true}).waitFor();assert.equal(saves.at(-1)?.masteryMode,'count');assert.equal(saves.at(-1)?.memorizationMode,'count');
 await page.screenshot({path:`outputs/teacher-settings-${width}.png`});
 await dialog.getByRole('button',{name:'إغلاق الإعدادات'}).click();
 await page.getByRole('button',{name:'حفظ',exact:true}).first().click();await page.getByRole('dialog').getByText('عدد الأخطاء',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'إتقان',exact:true}).first().click();await page.getByRole('dialog').getByText('عدد الأخطاء',{exact:true}).waitFor();await page.keyboard.press('Escape');
 if(width===360){
  const originalTasks=fixture.tasks;
  fixture.tasks=[
   {...originalTasks[0],teacherCompleted:true},
   {...originalTasks[1],teacherCompleted:false},
   ...['review','link'].map((taskType,i)=>({...originalTasks[2],id:1100+i,taskType})),
   {...originalTasks[3],teacherCompleted:true},
  ];
  fixture.executionSources={memorization:'teacher',review:'teacher',link:'teacher'};
  students[3].recitationPending=true;
  await page.reload();await page.getByText('اكتمل التسميع',{exact:true}).waitFor();
  const cards=page.locator('.recitation-reference-card');
  assert.equal(await cards.count(),4);
  assert.equal(await cards.nth(0).locator('.recitation-actions button').count(),0);
  assert.equal(await cards.nth(1).getByRole('button',{name:'إتقان',exact:true}).isEnabled(),true,'Retry stays actionable');
  assert.deepEqual(await cards.nth(2).locator('.recitation-actions button').allTextContents(),['مراجعة','ربط']);
  assert.equal(await cards.nth(2).locator('.recitation-actions button[data-active="true"]').count(),2,'All available buttons use the same primary color');
  await cards.nth(3).getByText('حُفظت النتيجة',{exact:true}).waitFor();
  assert.equal(await cards.nth(3).locator('.recitation-actions button').count(),0,'Saved task stays hidden');
  assert.equal(await cards.nth(3).getByText('اكتمل التسميع',{exact:true}).count(),0);
  students[3].recitationSyncFailed=true;
  await page.reload();await cards.nth(3).getByText('حُفظت النتيجة',{exact:true}).waitFor();
  assert.equal(await page.getByText('تعذرت المزامنة',{exact:true}).count(),0);
  assert.equal(await cards.nth(3).getByText('اكتمل التسميع',{exact:true}).count(),0);
  await page.screenshot({path:'outputs/teacher-session-states-mobile.png'});
  fixture.tasks=originalTasks;
 }
 await page.goto(`${base}/portal/previous-recitation-sessions`);
 await page.getByRole('combobox',{name:'الطالب',exact:true}).click();
 assert.equal(await page.getByRole('option').count(),2);
 await page.getByRole('option',{name:'طالب تجريبي 1',exact:true}).click();
 await page.locator('[data-plan-date="2022-01-03"]').waitFor();
 assert.equal(await page.locator('.student-plan-day').count(),1);
 const historyBoxes=await page.locator('.student-plan-amount').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));assert.equal(historyBoxes.length,3);assert.equal(new Set(historyBoxes).size,1);
 await page.getByText('2 أخطاء',{exact:true}).waitFor();assert.equal(await page.locator('.student-plan-amount button').count(),0);
 await page.screenshot({path:`outputs/teacher-history-${width}.png`});
 await page.getByRole('combobox',{name:'الطالب',exact:true}).click();await page.getByRole('option',{name:'طالب تجريبي 2',exact:true}).click();
 await page.getByText('لا توجد جلسات تسميع سابقة.',{exact:true}).waitFor();assert.equal(await page.locator('.student-plan-week').count(),0);
 await page.goto(`${base}/portal/reports`);await page.getByRole('combobox',{name:'نوع التقرير'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'الحلقة',exact:true}).count(),0);
 await page.getByText('حلقة الإتقان',{exact:true}).first().waitFor();await page.getByText('حلقة التميز',{exact:true}).first().waitFor();
 assert.ok(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth<=globalThis.innerWidth));
 await page.screenshot({path:`outputs/teacher-reports-${width}.png`});assert.deepEqual(errors,[]);
 results.push({width,students:4,settingsRows:3,unifiedModes:true,ownCommitteesOnly:true});await context.close();
}
await writeFile('outputs/teacher-portal-browser.json',JSON.stringify(results,null,2));process.stdout.write(JSON.stringify(results)+'\n');
}finally{await browser.close();}
