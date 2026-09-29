import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:3017/tests/fixtures/student-points.html');
    await page.getByLabel('نقاط اليوم: 25 من 75').click();
    await page.getByText('الحفظ 20 + السماع 5 + التكرار 5', { exact: true }).waitFor();
    await page.getByText('تقييم اليوم شمل مهام بتاريخ:', { exact: false }).waitFor();
    await page.getByText('قُيّم بتاريخ', { exact: false }).waitFor();
    await page.getByText('البرامج والمكافآت والتعديلات', { exact: true }).click();
    await page.getByText('حضور ثاني أيام البرنامج', { exact: true }).waitFor();
    assert.equal(await page.getByText('بانتظار التقييم', { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/student-daily-points-${width}.png` });
    await page.close();
  }
} finally { await browser.close(); }
