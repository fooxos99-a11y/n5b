import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let reportRequests = 0, loginRequests = 0, available = true;
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'manager');
      globalThis.localStorage.setItem('wajeh_account_id', '991');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.indexedDB.open = () => { throw new Error('Local database unavailable'); };
    });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let status = 200, json = [];
      if (path.endsWith('/auth/login')) loginRequests++;
      if (path.endsWith('/health')) { status = available ? 200 : 503; json = { ok: available }; }
      if (path.endsWith('/dashboard-bootstrap')) json = { settings: { staffAttendanceSource: 'supervisor' }, permissions: [] };
      if (path.endsWith('/settings') || path.endsWith('/public-settings')) json = {};
      if (path.endsWith('/reports/overview')) {
        reportRequests++;
        status = available ? 200 : 503;
        json = available ? { period: { from: '2026-10-01', to: '2026-10-10' }, totals: { familiesCount: 12 }, grades: {} }
          : { message: 'تعذر تحميل الإحصائيات' };
      }
      await route.fulfill({ status, json });
    });
    await page.goto(`${base}/dashboard/reports`);
    await page.getByRole('region', { name: 'مؤشرات الأداء', exact: true }).waitFor();
    assert.equal(loginRequests, 0, 'restored login does not require another login');
    assert.ok(reportRequests > 0, 'statistics load despite a failed local database');
    assert.equal(await page.locator('html').evaluate(element => element.classList.contains('account-login-active')), false);
    await page.reload();
    await page.getByRole('region', { name: 'مؤشرات الأداء', exact: true }).waitFor();
    assert.equal(loginRequests, 0, 'cold reload keeps the stored session');

    available = false;
    await page.reload();
    await page.getByText('تعذر تحميل الإحصائيات', { exact: true }).waitFor();
    const beforeRecovery = reportRequests;
    available = true;
    // Health probes can restore connectivity without a browser online/focus event.
    await page.evaluate(async () => {
      const { probeServerConnectivity } = await import('/src/hooks/useOnlineStatus.js');
      await probeServerConnectivity();
    });
    await page.getByRole('region', { name: 'مؤشرات الأداء', exact: true }).waitFor();
    assert.ok(reportRequests > beforeRecovery);
    assert.equal(loginRequests, 0, 'reconnect reloads statistics without logging out');
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    globalThis.console.log(`Saved-session statistics, unavailable local cache and reconnect recovery passed at ${width}px.`);
  }
} finally { await browser.close(); }
