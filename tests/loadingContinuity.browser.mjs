import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
 for (const width of [360, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:3017/tests/fixtures/loading-continuity.html');
  const spinner = page.locator('[data-loading-indicator="screen"] .loading-logo');
  await spinner.waitFor();
  // Headless browsers use overlay scrollbars; reserve the classic scrollbar
  // gutter explicitly to reproduce the RTL shift seen on first entry.
  await page.evaluate(() => {
   globalThis.document.documentElement.dir = 'rtl';
   globalThis.document.documentElement.style.scrollbarGutter = 'stable';
  });
  await page.evaluate(() => { globalThis.initialSpinner = globalThis.document.querySelector('[data-loading-indicator="screen"] .loading-logo'); });
  for (const stage of [2, 3]) {
   await page.evaluate(stage => { globalThis.document.documentElement.style.overflowY = stage === 2 ? 'scroll' : 'hidden'; globalThis.loadingTest(stage); }, stage);
   await page.waitForTimeout(40);
   assert.equal(await spinner.count(), 1);
   assert.ok(await page.evaluate(() => globalThis.initialSpinner === globalThis.document.querySelector('[data-loading-indicator="screen"] .loading-logo')));
   const box = await spinner.boundingBox();
   assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 1);
   assert.ok(Math.abs(box.y + box.height / 2 - 450) < 1);
  }
  await page.evaluate(() => globalThis.loadingTest(4));
  await spinner.waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'الحساب جاهز' }).waitFor();
  await page.close();
 }
} finally { await browser.close(); }
