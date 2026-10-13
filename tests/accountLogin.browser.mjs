import { URL } from 'node:url';
import process from 'node:process';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const browserType = process.env.PORTAL_TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const screenshotSuffix = browserType === webkit ? '-webkit' : '';
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
    await page.goto(`${base}/`);
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
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('link', { name: 'للتواصل اضغط هنا' }).count(), 0);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.mouse.wheel(0, 500);
    assert.equal(await page.evaluate(() => globalThis.scrollY), 0, 'login never scrolls the document');
    assert.equal(await page.locator('.account-login-content').evaluate(element => element.scrollHeight <= element.clientHeight), true, 'normal login viewport fits without inner scrolling');
    await page.screenshot({ path: `outputs/account-login-${role}${screenshotSuffix}.png` });
    await page.getByLabel('رقم الدخول', { exact: true }).press('Enter');
    assert.equal(logins, 0, 'The keyboard action does not submit an empty account number');
    await page.getByLabel('رقم الدخول', { exact: true }).fill('١٢٣٤٥');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('12');
    // Simulate the visual viewport independently of the layout viewport, as a software keyboard does.
    await page.evaluate(() => {
      const viewport = globalThis.visualViewport;
      Object.defineProperty(viewport, 'height', { configurable: true, value: 320 });
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 48 });
      viewport.dispatchEvent(new globalThis.Event('resize'));
    });
    await page.waitForFunction(() => globalThis.document.documentElement.dataset.loginKeyboard === 'open');
    await page.getByLabel('كلمة المرور', { exact: true }).focus();
    await page.waitForFunction(() => {
      const field = globalThis.document.querySelector('input[autocomplete="current-password"]').getBoundingClientRect();
      const content = globalThis.document.querySelector('.account-login-content').getBoundingClientRect();
      return field.top >= content.top && field.bottom <= content.bottom;
    });
    assert.equal(await page.evaluate(() => globalThis.scrollY), 0);
    assert.equal(await page.locator('main').evaluate(element => Math.round(element.getBoundingClientRect().height)), 320);
    const submitBounds = await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).boundingBox();
    const pageBounds = await page.locator('main').boundingBox();
    assert.ok(submitBounds.y + submitBounds.height <= pageBounds.y + pageBounds.height, 'The submit button stays above the keyboard');
    await page.screenshot({ path: `outputs/account-login-keyboard-${role}${screenshotSuffix}.png` });
    await page.evaluate(() => {
      delete globalThis.visualViewport.height;
      delete globalThis.visualViewport.offsetTop;
      globalThis.visualViewport.dispatchEvent(new globalThis.Event('resize'));
    });
    await page.waitForFunction(() => globalThis.document.documentElement.dataset.loginKeyboard === 'closed');
    assert.equal(await page.locator('main').evaluate(element => Math.round(element.getBoundingClientRect().height)), 844);
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
    await page.goto(`${base}/login`);
    await page.waitForURL((url) => url.pathname === destination);
    assert.equal(logins, 2, 'An existing session does not submit another login');
    await context.close();
  }
} finally { await browser.close(); }
