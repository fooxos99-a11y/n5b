import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required');
const browser = await chromium.launch({ headless: true });
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(`${base}/tests/fixtures/student-points.html`);
    await page.getByRole('combobox', { name: 'نوع التقرير' }).click();
    await page.getByRole('option', { name: 'نقاط الطلاب', exact: true }).click();
    const report = page.getByRole('region', { name: 'نقاط الطلاب', exact: true });
    await report.locator('details').first().waitFor();
    assert.match(await report.locator('summary').first().innerText(), /خالد/);
    await report.locator('summary').first().click();
    assert.match(await report.innerText(), /تقييم الحفظ/);
    assert.match(await report.innerText(), /تصحيح تقييم/);
    assert.match(await report.innerText(), /الرصيد الكلي: 360/);
    assert.equal(await report.getByRole('combobox').count(), 0);
    assert.equal(await report.getByRole('textbox').count(), 0);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.equal(await report.evaluate(element => globalThis.getComputedStyle(element).direction), 'rtl');
    await page.screenshot({ path: `outputs/student-points-${width}.png`, fullPage: true });
    await page.goto(`${base}/tests/fixtures/student-points.html?map`);
    await page.locator('.qassim-road-scene').waitFor();
    await page.evaluate(() => { globalThis.studentPointsFixture.points = 78; globalThis.dispatchEvent(new globalThis.Event('focus')); });
    await page.waitForFunction(() => globalThis.studentPointsFixture.saved.includes(78));
    assert.match(await page.locator('.qassim-road-scene').getAttribute('aria-label'), /78/);
    await page.goto(`${base}/tests/fixtures/student-points.html?status`);
    await page.getByTestId('feedback').waitFor();
    const feedback = await page.getByTestId('feedback').innerText();
    assert.match(feedback, /متقن/);
    assert.match(feedback, /لم يُستكمل/);
    assert.doesNotMatch(feedback, /يحتاج إعادة/);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log('Student points report and same-station map updates passed at 360, 768 and 1440px.');
