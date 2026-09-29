import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const base = 'http://127.0.0.1:3000';
const results = [];
await mkdir('outputs', { recursive: true });
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
      let logoutRequest;
      let releaseLogout;
      const logoutGate = new Promise((resolve) => { releaseLogout = resolve; });
      await context.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/logout') {
          logoutRequest = route.request();
          await logoutGate;
          await route.fulfill({ json: { ok: true } });
          return;
        }
        let json = {};
        if (path === '/api/offline-student/bootstrap') json = {
          date: '2026-09-06', store: { storeBalance: 10, products: [
            { id: 1, name: 'منتج متاح', pointsPrice: 5, stock: 3 },
            { id: 2, name: 'منتج رصيده غير كاف', pointsPrice: 50, stock: 3 },
          ] },
        };
        await route.fulfill({ json });
      });
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role', 'student');
        globalThis.localStorage.setItem('wajeh_student_id', '990');
        globalThis.localStorage.setItem('nukhab_web_session', '1');
        globalThis.localStorage.setItem('nukhab_tenant_registration_number', 'test-tenant');
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/tests/fixtures/interaction-regressions.html`);
      await page.getByText('منتج رصيده غير كاف', { exact: true }).waitFor();
      const buy = page.getByRole('button', { name: 'شراء', exact: true });
      assert.equal(await buy.nth(0).isEnabled(), true);
      assert.equal(await buy.nth(1).isEnabled(), false);
      await buy.nth(1).scrollIntoViewIfNeeded();
      for (const theme of ['light', 'dark']) {
        await page.locator('html').evaluate((el, theme) => { el.className = theme; }, theme);
        const style = await buy.nth(1).evaluate((el) => {
          const style = globalThis.getComputedStyle(el);
          return { gradient: style.backgroundImage, opacity: style.opacity, height: el.getBoundingClientRect().height };
        });
        assert.match(style.gradient, /208, 146, 37, 0.5/);
        assert.equal(style.opacity, '1');
        assert.ok(style.height >= 44, `${engineName} ${width}px: purchase height ${style.height}`);
        await page.screenshot({ path: `outputs/interactions-${engineName}-${width}-${theme}.png` });
      }
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      // Opening a select inside a modal and closing both must release scroll locks.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.getByRole('button', { name: 'فتح نافذة الاختبار' }).click();
        await page.getByRole('combobox').click();
        await page.getByRole('option', { name: 'الثاني' }).click();
        await page.getByRole('button', { name: 'إغلاق النافذة' }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => globalThis.document.body.dataset.scrollLocked === undefined && globalThis.getComputedStyle(globalThis.document.body).pointerEvents !== 'none');
      }
      await page.getByRole('button', { name: 'نهاية الصفحة' }).focus();
      await page.keyboard.press('End');
      await page.waitForFunction(() => globalThis.scrollY > 500);
      await page.waitForFunction(() => {
        const button = [...globalThis.document.querySelectorAll('button')].find((item) => item.textContent === 'نهاية الصفحة');
        const rect = button.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= globalThis.innerHeight;
      });
      const lastButton = await page.getByRole('button', { name: 'نهاية الصفحة' }).boundingBox();
      assert.ok(lastButton.y >= 0 && lastButton.y + lastButton.height <= 900);
      // An actual touch gesture must scroll the document on touch-capable Chromium.
      if (engineName === 'chromium') {
        await page.evaluate(() => globalThis.scrollTo({ top: 0, behavior: 'instant' }));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: 700 }] });
        for (let y = 660; y >= 200; y -= 40) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => globalThis.scrollY > 100);
      }
      if (width < 1024) await page.getByRole('button', { name: 'فتح القائمة الجانبية' }).click();
      const started = Date.now();
      await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).filter({ visible: true }).click();
      await page.waitForURL(`${base}/`, { timeout: 1500 });
      const logoutMs = Date.now() - started;
      assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('nukhab_web_session')), null);
      assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), null);
      assert.ok(logoutRequest, 'The server revocation starts while its response is still delayed');
      assert.equal(logoutRequest.headers()['x-registration-number'], 'test-tenant');
      releaseLogout();
      assert.deepEqual(errors, []);
      results.push({ engine: engineName, width, logoutMs, scroll: 'passed', purchase: 'passed' });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/interaction-regressions.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
