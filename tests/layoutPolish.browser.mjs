import { join } from 'node:path';
import { createTemporaryArtifactDirectory } from './helpers/temporaryArtifacts.mjs';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
const artifactDirectory = createTemporaryArtifactDirectory();
const base=process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107';
const browser=await chromium.launch();
try {
  for(const width of [360,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:950}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2028-02-15T12:00:00Z')});
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      let body=[];
      if(path.endsWith('/student-news/manage')) body={entries:[],revision:0};
      if(path.endsWith('/student-news/audience') || path.endsWith('/committees')) body=[{id:1,name:'حلقة الاختبار'}];
      if(path.endsWith('/grading/policy')) body={policy:normalizeGradingPolicy()};
      if(path.endsWith('/grading/week')) body={weekStart:'2028-02-13',policy:normalizeGradingPolicy(),students:[{id:1,name:'طالب الاختبار',committeeName:'حلقة الاختبار',grade:{total:47,max:100,weeklyDetail:{attended:true},weeklySession:{grade:20,max:20}}}]};
      if(path.endsWith('/student-plans')) body=[{studentId:1,studentName:'طالب الاختبار',committeeName:'حلقة الاختبار',priorMemorization:[],plan:{id:2,progressPercent:35,summary:'المقدار المحذوف من القائمة',status:'active'}}];
      if(path.endsWith('/public-settings')) body={};
      await route.fulfill({json:body});
    });
    const screenshot=async name=>{
      assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
      await page.screenshot({path:join(artifactDirectory, `nukhab-layout-${name}-${width}.png`),animations:'disabled'});
    };
    await page.goto(`${base}/tests/fixtures/scoped-ui.html?section=news-editor`);
    await page.getByRole('button',{name:'إضافة خبر',exact:true}).click();
    assert.equal(await page.locator('#news-start-date').inputValue(),'2028-02-15');
    assert.equal(await page.locator('#news-end-date').inputValue(),'2028-02-29');
    const color=page.locator('#news-text-color');
    assert.equal(await color.evaluate(el=>globalThis.getComputedStyle(el).width),'44px');
    assert.equal(await color.evaluate(el=>globalThis.getComputedStyle(el).height),'44px');
    assert.equal(await color.evaluate(el=>globalThis.getComputedStyle(el).padding),'0px');
    assert.equal(await color.evaluate(el=>globalThis.getComputedStyle(el).borderWidth),'0px');
    await screenshot('news');
    await page.goto(`${base}/tests/fixtures/scoped-ui.html?section=whatsapp`);
    const attachment=page.locator('label').filter({hasText:'إرفاق ملف'});
    await attachment.waitFor();
    assert.equal(await attachment.evaluate(el=>globalThis.getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    await screenshot('whatsapp');
    for(const section of ['weekly','track']) {
      await page.goto(`${base}/tests/fixtures/weekly-refinements.html?section=${section}`);
      await page.getByText('طالب الاختبار',{exact:true}).waitFor();
      assert.equal(await page.getByText(/المجموع الأسبوعي/).count(),0);
      const nav=await page.getByRole('button',{name:'الأسبوع السابق',exact:true}).boundingBox();
      const panel=await page.locator('main > section').boundingBox();
      assert.ok(panel.x+panel.width-(nav.x+nav.width)<30,'Week controls stay at the RTL edge');
      await screenshot(section);
    }
    await page.goto(`${base}/tests/fixtures/weekly-refinements.html?section=plans`);
    await page.getByText('طالب الاختبار',{exact:true}).waitFor();
    assert.equal(await page.getByText('المقدار المحذوف من القائمة',{exact:true}).count(),0);
    const label=await page.getByText('نسبة الإنجاز 35٪',{exact:true}).boundingBox();
    const bar=await page.locator('[title="35٪"]').boundingBox();
    assert.ok(bar.y>=label.y+label.height);
    await screenshot('plans');
    assert.deepEqual(errors,[]);
    await page.close();
    globalThis.console.log(`Layout polish passed at ${width}px.`);
  }
} finally {await browser.close();}
