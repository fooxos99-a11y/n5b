import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const [role, permissions, destination] of [
    ['student', [], '/'], ['supervisor', [], '/portal'],
    ['admin', ['students'], '/dashboard'], ['manager', [], '/dashboard'],
  ]) {
    const width = { student: 360, supervisor: 768, admin: 390, manager: 1440 }[role];
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
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
        assert.deepEqual(route.request().postDataJSON(), { loginNumber: '12345', password: '12' });
        return route.fulfill(fail ? { status: 401, json: { message: 'رقم الحساب غير صحيح' } } : { json: { role, id: 991, name: 'حساب اختبار', dashboardPermissions: permissions } });
      }
      await route.fulfill({ json: path.endsWith('/public-settings') ? {} : [] });
    });
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('heading', { name: 'برنامج نخب التعليمي', exact: true }).waitFor();
    assert.equal(await page.locator('html').evaluate((root) => root.classList.contains('light') && !root.classList.contains('dark')), true);
    assert.equal(await page.locator('main').evaluate((main) => {
      const color = globalThis.getComputedStyle(main).backgroundColor.match(/\d+/g).map(Number);
      return color.slice(0, 3).every((channel) => channel > 200);
    }), true, 'Login stays light even when the saved theme is dark');
    assert.equal(await page.getByRole('link', { name: 'الرئيسية', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'هل نسيت كلمة المرور؟', exact: true }).click();
    await page.getByRole('dialog').getByRole('heading', { name: 'الرجاء التواصل مع الإدارة.' }).waitFor();
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    assert.equal(await page.getByRole('link', { name: 'للتواصل اضغط هنا' }).getAttribute('href'), 'https://wa.me/05');
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/account-login-${role}.png` });
    await page.getByLabel('رقم الدخول', { exact: true }).press('Enter');
    assert.equal(logins, 0, 'The keyboard action does not submit an empty account number');
    await page.getByLabel('رقم الدخول', { exact: true }).fill('١٢٣٤٥');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'إظهار كلمة المرور' }).click();
    assert.equal(await page.getByLabel('كلمة المرور', { exact: true }).getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'إخفاء كلمة المرور' }).click();
    await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).click();
    await page.getByText('تعذر الدخول', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
    fail = false;
    await page.waitForFunction(() => {
      const input = globalThis.document.querySelector('input[autocomplete="username"]');
      return input && !input.closest('[inert]') && !input.matches(':disabled');
    });
    await page.getByLabel('رقم الدخول', { exact: true }).fill('12345');
    const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/auth/login'));
    await page.getByLabel('رقم الدخول', { exact: true }).press('Enter');
    assert.equal((await loginResponse).status(), 200);
    await page.waitForFunction(() => Boolean(globalThis.localStorage.getItem('wajeh_role')));
    await page.waitForURL((url) => url.pathname === destination);
    assert.equal(logins, 2);
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForURL((url) => url.pathname === destination);
    assert.equal(logins, 2, 'An existing session does not submit another login');
    await context.close();
  }
} finally { await browser.close(); }
