import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3119';
const browser = await chromium.launch();
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/fixtures/track-test-segments.html`);
    await page.getByRole('button',{name:'اختبار الطالب التجريبي',exact:true}).click();
    for (const [name,value] of [['الأخطاء',1],['الترددات',2],['التنبيهات',3]]) await page.getByRole('spinbutton',{name,exact:true}).fill(String(value));
    await page.getByRole('button',{name:'التالي',exact:true}).click();
    for (const [name,value] of [['الأخطاء',4],['الترددات',5],['التنبيهات',6]]) await page.getByRole('spinbutton',{name,exact:true}).fill(String(value));
    await page.getByRole('button',{name:'المقطع السابق',exact:true}).click();
    await page.getByRole('button',{name:'فتح المصحف',exact:true}).click();
    const session = page.getByLabel('جلسة التسميع',{exact:true});
    await session.locator('[data-mushaf-word-index]').first().waitFor();
    await session.getByRole('button',{name:'المقطع التالي',exact:true}).click();
    await session.locator('[data-mushaf-word-index]').first().waitFor();
    assert.doesNotMatch(await session.innerText(), /حفظ جلسة المسار|المقطع [12] من|مقطع عشوائي آخر/);
    const face = session.locator('.mushaf-page-turn .mushaf-page');
    const box = await face.boundingBox();
    await face.click({position:{x:3,y:box.height/2}});
    await session.getByRole('button',{name:'إنهاء',exact:true}).click();
    await page.getByLabel('نتيجة الاختبار').waitFor();
    const result = JSON.parse(await page.getByLabel('نتيجة الاختبار').innerText());
    assert.deepEqual(result.map(item=>[item.range.fromAyah,item.mistakes,item.hesitations,item.warnings]),[[1,1,2,3],[11,4,5,6]]);
    assert.equal(await page.getByLabel('عدد طلبات الحفظ').innerText(),'1');
    assert.deepEqual(errors,[]);
    await page.close();
    globalThis.console.log(`Track finish preserves both manual evaluations at ${width}px`);
  }
} finally {await browser.close();}
