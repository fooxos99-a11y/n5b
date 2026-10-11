import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import process from 'node:process';
import { join } from 'node:path';

const browser = await chromium.launch({ headless:true });
try {
  for (const width of [320,390,1440]) {
    const page = await browser.newPage({ viewport:{ width, height:900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3019/tests/fixtures/review-compensation.html');
    const open = page.getByRole('button', { name:'تسميع المتعثر لدى طالب الاختبار' });
    await open.click();
    let review = page.locator('section').filter({ has:page.getByRole('heading', { name:'المراجعة', exact:true }) });
    await review.getByText('عليه 2', { exact:true }).waitFor();
    assert.ok(await review.getByRole('button', { name:'تسميع', exact:true }).isDisabled());
    assert.equal(await page.getByText('تُضاف المراجعة الفائتة إلى مقدار المراجعة في جلسة التسميع.').count(), 0);
    await page.getByRole('button', { name:'إغلاق', exact:true }).click();
    await page.getByRole('button', { name:'اعتماد مراجعة اليوم' }).click();
    await page.getByRole('button', { name:'فشل الاتصال التالي' }).click();
    await open.click();
    review = page.locator('section').filter({ has:page.getByRole('heading', { name:'المراجعة', exact:true }) });
    await review.getByRole('button', { name:'تسميع', exact:true }).click();
    await page.getByRole('alert').getByText('تعذر الاتصال. أعد المحاولة.').waitFor();
    assert.ok(await review.getByRole('button', { name:'تسميع', exact:true }).isEnabled());
    await page.getByRole('dialog').screenshot({ path:join(process.env.TEMP, `nukhab-review-compensation-${width}.png`) });
    assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await review.getByRole('button', { name:'تسميع', exact:true }).click();
    await page.getByRole('heading', { name:'تعويض المراجعة', exact:true }).waitFor();
    assert.deepEqual(await page.evaluate(() => globalThis.reviewCompensationTest.taskIds), [12]);
    await page.getByLabel('عدد التنبيهات', { exact:true }).fill('1');
    await page.getByLabel('عدد الترددات', { exact:true }).fill('2');
    await page.getByLabel('عدد الأخطاء', { exact:true }).fill('3');
    await page.getByRole('button', { name:'إغلاق', exact:true }).click();
    await open.click();
    review = page.locator('section').filter({ has:page.getByRole('heading', { name:'المراجعة', exact:true }) });
    await review.getByRole('button', { name:'متابعة التسميع', exact:true }).waitFor();
    await review.getByRole('button', { name:'متابعة التسميع', exact:true }).click();
    await page.getByRole('button', { name:'إنهاء', exact:true }).click();
    await open.click();
    await page.getByText('عليه 1 · عوّض 1', { exact:true }).waitFor();
    assert.ok((await page.evaluate(() => globalThis.reviewCompensationTest.requests)).every(payload => payload.taskType === 'review' && payload.studentId === 3));
    assert.deepEqual(errors, []);
    await page.close();
  }
  globalThis.console.log('Review compensation browser passed at 320/390/1440: completed student visible, daily gate, create failure retry, separate count dialog, pending resume, updated remaining days, RTL/no overflow.');
} finally { await browser.close(); }
