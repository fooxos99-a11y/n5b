import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3011';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required');
const browser = await chromium.launch({ headless: true });
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.goto(`${base}/tests/fixtures/recitation-acknowledgement.html`);
    await page.waitForFunction(() => globalThis.acknowledgementFixture?.requests.length === 1);
    await page.evaluate(() => { const f = globalThis.acknowledgementFixture; f.requests[0](f.initial); });
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
    await page.locator('summary').click();
    await page.getByText('محفوظ على الجهاز — بانتظار اعتماد السيرفر', { exact: true }).waitFor();
    // A focus request starts after the local save but before server acknowledgement.
    await page.evaluate(() => { void globalThis.acknowledgementFixture.data.load(); });
    await page.waitForFunction(() => globalThis.acknowledgementFixture.requests.length === 2);
    await page.evaluate(() => {
      const f = globalThis.acknowledgementFixture;
      f.accept();
      void f.data.load({ fresh: true });
      if (f.requests.length !== 3) throw new Error('Acknowledgement reused the pre-acceptance request');
      f.requests[1](f.initial);
      f.requests[2](f.initial); // Even this stale response must respect the durable acknowledgement.
    });
    await page.getByText('معتمد في المنصة', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
    await page.reload();
    await page.waitForFunction(() => globalThis.acknowledgementFixture?.requests.length === 1);
    await page.evaluate(() => { const f = globalThis.acknowledgementFixture; f.requests[0](f.initial); });
    await page.locator('summary').click();
    await page.getByText('معتمد في المنصة', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
    for (const [status, text] of [['local_rejected', 'لم يعتمد السيرفر النتيجة'], ['server_saved', 'معتمد في المنصة']]) {
      await page.evaluate(async status => {
        const f = globalThis.acknowledgementFixture;
        const loading = f.data.load({ fresh: true });
        f.requests.at(-1)({ ...f.initial, tasks: [], taskQueue: [], deliveryReceipts: [{ taskId: 1, studentId: 8, studentName: 'طالب الاختبار', taskType: 'memorization', taskDate: f.initial.date, status }] });
        await loading;
      }, status);
      await page.getByText(text, { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
    }
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/recitation-acknowledgement-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log('Acknowledgement race, device reload and distinct receipts passed at 360/768/1440px.');
