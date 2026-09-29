import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
 for (const width of [360, 768, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://127.0.0.1:3011/tests/fixtures/teacher-history-entry.html');
  const first = page.getByRole('button', { name: 'طالب تجريبي أول', exact: true });
  await first.waitFor();
  assert.equal(await page.locator('[data-student-history-card]').count(), 2);
  assert.equal(await page.getByRole('combobox').count(), 0);
  assert.ok(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.screenshot({ path: `outputs/teacher-history-entry-${width}.png` });
  await first.click();
  await page.getByText('لا توجد جلسات تسميع سابقة.', { exact: true }).waitFor();
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  const second = page.getByRole('button', { name: 'طالب تجريبي ثان', exact: true });
  await second.click();
  await page.getByText('لا توجد جلسات تسميع سابقة.', { exact: true }).waitFor();
  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  assert.equal(await second.getAttribute('aria-expanded'), 'true');
  await page.close();
 }
} finally { await browser.close(); }
