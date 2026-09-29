import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
const browser = await chromium.launch({ headless: true });
const base = 'http://127.0.0.1:3107';
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const reads = [];
    const saves = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/grading/policy')) {
        if (route.request().method() === 'PUT') saves.push(route.request().postDataJSON());
        body = { policy: normalizeGradingPolicy({}) };
      }
      if (path.endsWith('/notifications')) body = [{ id: 1, title: 'إشعار تجريبي', body: 'تفاصيل الإشعار', isRead: false }];
      if (path.includes('/read')) { reads.push(path); body = { ok: true }; }
      if (path.endsWith('/store/configuration')) body = { storeEnabled: false };
      if (path.endsWith('/store/orders')) body = [{ id: 7, studentName: 'طالب تجريبي', productName: 'منتج', pointsPrice: 5, status: 'pending' }];
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/tests/fixtures/audit-settings.html`);
    await page.getByLabel('درجة الحفظ اليومية', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.getByRole('button', { name: /الإشعارات/ }).click();
    await page.getByText('إشعار تجريبي', { exact: true }).waitFor();
    assert.equal(reads.length, 0, 'Opening notifications must not mark unseen items as read');
    const popover = page.locator('.student-home-notifications');
    const bounds = await popover.boundingBox();
    assert.ok(bounds.width > 280 && bounds.x >= 0 && bounds.x + bounds.width <= width);
    const marked = page.waitForResponse(response => response.url().includes('/notifications/1/read'));
    await page.getByText('إشعار تجريبي', { exact: true }).click();
    await marked;
    assert.equal(reads.length, 1);
    await page.keyboard.press('Escape');
    await page.getByLabel('درجة الحفظ اليومية', { exact: true }).fill('0.5');
    const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/grading/policy'));
    await page.getByRole('button', { name: 'مغادرة الإعدادات' }).click();
    await saved;
    assert.equal(saves.at(-1).policy.weeklyProgram.memorizationDaily, 0.5);
    await page.goto(`${base}/tests/fixtures/store-management.html`);
    await page.getByText('طالب تجريبي — منتج', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'قبول', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.close();
    globalThis.console.log(`Audit settings, notifications and disabled store passed at ${width}px`);
  }
} finally { await browser.close(); }
