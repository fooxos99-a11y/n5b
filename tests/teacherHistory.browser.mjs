import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
 for (const width of [360, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:3011/tests/fixtures/teacher-history.html');
  await page.locator('[data-teacher-session]').waitFor();
  await page.locator('[data-date-range]').waitFor();
  assert.equal(await page.locator('[data-teacher-session] h4').allTextContents().then(x => x.join(',')), 'الحفظ,المراجعة,الربط,الإتقان');
  assert.ok(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth));
  const header = await page.locator('.dashboard-header').boundingBox();
  const card = await page.locator('[data-teacher-session]').boundingBox();
  assert.ok(card.y >= header.y + header.height);
  await page.screenshot({ path: `outputs/teacher-history-${width}.png` });
  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  await page.locator('[data-loading-indicator="local"]').waitFor();
  assert.equal(await page.locator('[data-loading-indicator="screen"]').count(), 0);
  assert.ok(await page.locator('.dashboard-header').isVisible());
  if (width >= 1024) assert.ok(await page.locator('aside').first().isVisible());
  await page.close();
 }
} finally { await browser.close(); }
