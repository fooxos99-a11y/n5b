import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
 for (const width of [360, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:3011/tests/fixtures/teacher-compact.html');
  const close = page.getByRole('button', { name: 'إغلاق', exact: true });
  await close.waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.getByText('مقطع 1', { exact: true }).count(), 0);
  const finish = await page.getByRole('button', { name: 'إنهاء', exact: true }).boundingBox();
  const incomplete = await page.getByRole('button', { name: 'لم يتم الحفظ', exact: true }).boundingBox();
  assert.ok((await close.boundingBox()).x > incomplete.x && incomplete.x > finish.x);
  assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: `outputs/teacher-compact-${width}.png` });
  await page.close();
 }
} finally { await browser.close(); }
