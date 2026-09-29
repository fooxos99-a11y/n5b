import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { URL } from 'node:url';
const base = globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107';
const browser = await chromium.launch();
try {
  for (const width of [360,768,1440]) {
    const page = await browser.newPage({viewport:{width,height:950}});
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseLoad, releaseEnd;
    const loadGate = new Promise(resolve => { releaseLoad = resolve; });
    const endGate = new Promise(resolve => { releaseEnd = resolve; });
    const student = {id:'11',studentName:'طالب التجربة',committeeId:'5',committeeName:'حلقة التجربة',status:'in_progress',totalFaces:3,reciterNames:['أحمد المعلم'],parts:[
      {id:'51',juzNumber:1,startSurah:1,startAyah:1,endSurah:2,endAyah:5,startSurahName:'الفاتحة',endSurahName:'البقرة',score:90,mistakeCount:2,warningCount:1,wordMarks:[
        {markType:'mistake',startLocation:'1:1:1',endLocation:'1:1:2',selectedText:'بسم الله'},
        {markType:'lahn',startLocation:'1:2:1',endLocation:'1:2:2',selectedText:'الحمد لله'},
        {markType:'warning',startLocation:'1:3:1',endLocation:'1:3:2',selectedText:'الرحمن الرحيم'}]},
      {id:'52',juzNumber:1,startSurah:2,startAyah:10,endSurah:2,endAyah:20,startSurahName:'البقرة',endSurahName:'البقرة',score:null},
      {id:'53',juzNumber:2,startSurah:2,startAyah:142,endSurah:2,endAyah:150,startSurahName:'البقرة',endSurahName:'البقرة',score:80,mistakeCount:3,warningCount:1},
    ]};
    const event = {id:'7',name:'سرد التجربة',startDate:'2026-09-29',endDate:'2026-09-29',status:'open',students:[student],evaluationPolicy:{maxScore:100}};
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/committees')) body = [{id:5,name:'حلقة التجربة'}];
      else if (path.endsWith('/narration-events')) body = [{...event,students:undefined}];
      else if (path.endsWith('/7/archive')) { await endGate; event.status='archived'; body={ok:true,archivedAll:true}; }
      else if (path.endsWith('/7')) { await loadGate; body=event; }
      else if (path.endsWith('/status')) { writes.push(route.request().postDataJSON()); student.reciterNames.push('محمد المدير'); body={ok:true}; }
      else if (path.endsWith('/juz/1')) { writes.push(route.request().postDataJSON()); student.parts.slice(0,2).forEach(part => {part.score=94;}); body={ok:true,score:94}; }
      else if (path.endsWith('/ayahs')) body={ayahs:[{surah:1,ayah:1,textUthmani:'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'},{surah:1,ayah:2,textUthmani:'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'},{surah:1,ayah:3,textUthmani:'الرَّحْمَٰنِ الرَّحِيمِ'}]};
      await route.fulfill({json:body});
    });
    await page.goto(`${base}/tests/fixtures/narration-refinements.html`);
    await page.getByText('جاري تحميل يوم السرد',{exact:true}).waitFor();
    releaseLoad();
    await page.getByRole('button',{name:'بدء',exact:true}).click();
    assert.equal(await page.getByText('لم يُقيّم',{exact:true}).count(),0);
    assert.equal(await page.getByText(/الحالة:|لم يبدأ|مستأذن/).count(),0);
    const first=page.locator('section[aria-label="الجزء 1"]');
    await first.getByRole('button',{name:'بدأ التسميع',exact:true}).click();
    await page.getByRole('button',{name:'تسجيل عدد الأخطاء والتنبيهات',exact:true}).click();
    await page.getByRole('button',{name:'حفظ',exact:true}).click();
    await first.getByText('94.0 من 100',{exact:true}).waitFor();
    await page.getByText('محمد المدير',{exact:true}).waitFor();
    await first.getByRole('button',{name:'بدأ التسميع',exact:true}).waitFor();
    assert.equal(writes.length,2);
    assert.ok(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:`outputs/narration-live-${width}.png`,animations:'disabled'});
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state:'detached'});
    await page.getByRole('button',{name:'إنهاء يوم السرد',exact:true}).click();
    const end=page.getByRole('dialog');
    assert.equal(await end.getByText(/سيتم إنهاء السرد/).count(),0);
    await end.getByRole('button',{name:'إنهاء يوم السرد',exact:true}).click();
    await end.getByRole('button',{name:'جاري إنهاء يوم السرد',exact:true}).waitFor();
    releaseEnd();
    await end.waitFor({state:'detached'});
    await page.getByRole('button',{name:'أرشيف أيام السرد',exact:true}).click();
    const archive=page.getByRole('dialog');
    assert.equal(await archive.getByText(/2026-09-29/).count(),0);
    await archive.getByRole('button',{name:'سرد التجربة',exact:true}).click();
    await page.getByRole('button',{name:'عرض',exact:true}).click();
    await first.getByRole('button',{name:'عرض الأخطاء',exact:true}).click();
    await page.getByText('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',{exact:false}).waitFor();
    for(const text of ['الأخطاء: 1','اللحون: 1','التنبيهات: 1']) assert.equal(await page.getByText(text,{exact:true}).count(),1);
    assert.ok(await page.getByRole('dialog').last().evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:`outputs/narration-archive-${width}.png`,animations:'disabled'});
    await page.getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.locator('section[aria-label="الجزء 2"]').getByRole('button',{name:'عرض الأخطاء',exact:true}).click();
    await page.getByText('الأخطاء: 3',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    await page.close();
    globalThis.console.log(`Narration loading, manager save, partial scores, names and archive passed at ${width}px.`);
  }
} finally {await browser.close();}
