import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const [role, permissions, destination] of [
    ['student', [], '/'], ['supervisor', [], '/portal'],
    ['admin', ['students'], '/dashboard'], ['manager', [], '/dashboard'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('nukhab_theme_public', 'dark');
      globalThis.localStorage.setItem('nukhab_theme_account', 'dark');
    });
    let fail = true;
    let logins = 0;
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/login')) {
        logins++;
        assert.deepEqual(route.request().postDataJSON(), { loginNumber: '12345' });
        return route.fulfill(fail ? { status: 401, json: { message: 'رقم الحساب غير صحيح' } } : { json: { role, id: 991, name: 'حساب اختبار', dashboardPermissions: permissions } });
      }
      await route.fulfill({ json: path.endsWith('/public-settings') ? {} : [] });
    });
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('heading', { name: 'تسجيل الدخول', exact: true }).waitFor();
    assert.equal(await page.locator('html').evaluate((root) => root.classList.contains('light') && !root.classList.contains('dark')), true);
    assert.equal(await page.locator('main').evaluate((main) => {
      const color = globalThis.getComputedStyle(main).backgroundColor.match(/\d+/g).map(Number);
      return color.slice(0, 3).every((channel) => channel > 200);
    }), true, 'Login stays light even when the saved theme is dark');
    assert.equal(await page.getByRole('link', { name: 'الرئيسية', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: 'دخول', exact: true }).isDisabled());
    await page.screenshot({ path: `outputs/account-login-${role}.png` });
    await page.getByLabel('رقم الحساب', { exact: true }).fill('١٢٣٤٥');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await page.getByText('تعذر الدخول', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
    fail = false;
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await page.waitForURL((url) => url.pathname === destination);
    assert.equal(logins, 2);
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForURL((url) => url.pathname === destination);
    assert.equal(logins, 2, 'An existing session does not submit another login');
    await context.close();
  }
} finally { await browser.close(); }
