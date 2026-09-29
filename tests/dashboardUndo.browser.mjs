import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';

const base = process.env.NEWS_TEST_URL || 'http://127.0.0.1:3019';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    let stored = { revision: 0, entries: ['الأول', 'الثاني'].map((title, i) => ({ id: String(i), title, body: 'نص الخبر', image: '', committeeIds: [], enabled: true, startsAt: '', endsAt: '' })) };
    let action;
    let writes = 0;
    let undos = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/student-news**', async route => {
      const request = route.request();
      if (request.method() === 'PUT') {
        writes++;
        assert.equal(request.headers()['x-dashboard-undo'], '1');
        const before = globalThis.structuredClone(stored);
        stored = { ...request.postDataJSON(), revision: stored.revision + 1 };
        action = { before, after: stored.revision, id: String(writes).padStart(64, '0') };
        return route.fulfill({ headers: { 'X-Dashboard-Undo': JSON.stringify({ id: action.id, durationMs: 10_000 }) }, json: stored });
      }
      return route.fulfill({ json: request.url().endsWith('/audience') ? [] : stored });
    });
    await page.route('**/api/dashboard-undo/**', async route => {
      undos++;
      assert.equal(route.request().headers()['x-dashboard-undo'], undefined);
      stored = { ...action.before, revision: stored.revision + 1 };
      await route.fulfill({ json: { success: true } });
    });
    await page.goto(`${base}/tests/fixtures/student-news.html?editor`);
    await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
    await page.getByLabel('الخبر', { exact: true }).fill('خبر معدّل');
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(writes, 1, 'Saving reaches the API before the ten-second window');
    assert.equal(stored.entries[0].title, 'خبر معدّل');
    await page.getByRole('button', { name: 'تراجع', exact: true }).waitFor();
    const undoBounds = await page.getByRole('button', { name: 'تراجع', exact: true }).boundingBox();
    assert.ok(undoBounds.height >= 44 && undoBounds.x >= 0 && undoBounds.x + undoBounds.width <= width);
    assert.equal(await page.locator('[data-dashboard-undo]').getByText(/خلال|ثوان/).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'إضافة خبر', exact: true }).isEnabled(), true);
    assert.ok(await page.getByRole('button', { name: 'تعديل', exact: true }).evaluateAll(buttons => buttons.every(button => !button.disabled)));
    // A second form remains usable during the first action's undo window.
    await page.getByRole('button', { name: 'تعديل', exact: true }).nth(1).click();
    await page.getByLabel('الخبر', { exact: true }).fill('مسودة أخرى');
    await page.getByRole('button', { name: 'تراجع', exact: true }).click();
    await page.getByRole('button', { name: 'تراجع', exact: true }).waitFor({ state: 'detached' });
    assert.equal(undos, 1);
    assert.equal(stored.entries[0].title, 'الأول');
    assert.equal(await page.getByLabel('الخبر', { exact: true }).inputValue(), 'مسودة أخرى', 'Undo does not discard another open draft');
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('heading', { name: 'الأول', exact: true }).waitFor();
    await page.getByRole('button', { name: 'حذف', exact: true }).first().click();
    await page.getByRole('button', { name: 'تراجع', exact: true }).waitFor({ timeout: 3000 });
    assert.equal(stored.entries.length, 1);
    if (width === 768) await page.keyboard.press('Control+z');
    else await page.getByRole('button', { name: 'تراجع', exact: true }).click();
    await page.getByRole('heading', { name: 'الأول', exact: true }).waitFor();
    assert.equal(stored.entries.length, 2);
    if (width === 360) {
      await page.getByRole('button', { name: 'حذف', exact: true }).first().click();
      await page.getByRole('button', { name: 'تراجع', exact: true }).waitFor();
      const committedWrites = writes;
      assert.equal(stored.entries.length, 1);
      await page.getByRole('button', { name: 'تراجع', exact: true }).waitFor({ state: 'detached', timeout: 12_000 });
      assert.equal(writes, committedWrites, 'Expiry does not execute the operation again');
      assert.equal(stored.entries.length, 1);
    }
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/dashboard-undo-${width}.png` });
    await page.close();
  }
} finally { await browser.close(); }
