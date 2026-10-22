import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

const browser=await chromium.launch({ headless:true });
try {
  for(const width of [320,390,1440]) {
    const page=await browser.newPage({ viewport:{ width,height:950 } });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3019'}/tests/fixtures/statistics.html`, { waitUntil:'domcontentloaded', timeout:90000 });
    await page.getByRole('button',{ name:'متوسط نتائج الاجتياز الفرعي: 80٪',exact:true }).waitFor();
    await page.getByRole('button',{ name:'متوسط نتائج اجتياز حافظ: 90٪',exact:true }).waitFor();
    assert.equal(await page.getByText('يوم السرد',{ exact:true }).count(),0);
    assert.equal(await page.getByText('مستويات الطلاب',{ exact:true }).count(),0);
    assert.ok(await page.getByRole('button',{ name:/الطلاب:/ }).count());
    assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=globalThis.innerWidth));
    await page.getByRole('button',{ name:'متوسط نتائج الاجتياز الفرعي: 80٪',exact:true }).click();
    let dialog=page.getByRole('dialog');
    await dialog.getByRole('heading',{ name:'تفاصيل متوسط نتائج الاجتياز الفرعي' }).waitFor();
    await dialog.getByText('المستحقون للاختبار',{ exact:true }).waitFor();
    await dialog.getByText('اختُبروا',{ exact:true }).waitFor();
    await dialog.getByText('لم يُختبروا',{ exact:true }).waitFor();
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await dialog.screenshot({ path:join(tmpdir(),`nukhab-branch-statistics-${width}.png`),animations:'disabled' });
    await dialog.getByRole('button',{ name:/إغلاق/ }).first().click();
    await page.getByRole('button',{ name:'إكمال الرصد — عبد الله بن عبد الرحمن مشرف المسارات',exact:true }).click();
    dialog=page.getByRole('dialog');
    await dialog.getByText('مرات رصد الطلاب المكتملة',{ exact:true }).waitFor();
    await dialog.getByText('8',{ exact:true }).waitFor();
    await dialog.getByText('10',{ exact:true }).waitFor();
    assert.equal(await dialog.getByText('الدرجات المحققة',{ exact:true }).count(),0);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await dialog.screenshot({ path:join(tmpdir(),`nukhab-recording-statistics-${width}.png`),animations:'disabled' });
    await dialog.getByRole('button',{ name:'إغلاق التفاصيل' }).click();
    await page.getByRole('button',{ name:'إكمال الرصد — مشرف الاختبار الثالث',exact:true }).click();
    await page.getByText('لا يوجد رصد مطلوب خلال الفترة.',{ exact:true }).waitFor();
    await page.getByRole('button',{ name:'إغلاق التفاصيل' }).click();
    const archived=page.getByRole('button',{ name:'إكمال الرصد — مشرف أرشيف قديم',exact:true });
    assert.ok((await archived.innerText()).includes('—'));
    assert.ok(!(await archived.innerText()).includes('90%'));
    await archived.click();
    await page.getByText('بيانات إكمال الرصد غير متاحة في هذا التقرير.',{ exact:true }).waitFor();
    await page.getByRole('button',{ name:'إغلاق التفاصيل' }).click();
    await page.getByRole('button',{ name:'الحضور — عبد الله بن عبد الرحمن مشرف المسارات',exact:true }).click();
    await page.getByRole('dialog').getByText('الاستئذان المعتمد',{ exact:true }).waitFor();
    assert.deepEqual(errors,[]);
    await page.close();
  }
  globalThis.console.log('Operational statistics browser passed at 320/390/1440: independent branch/hafiz result averages and details, Students title, personal attendance, recording counts/empty state, RTL and no overflow.');
} finally { await browser.close(); }
