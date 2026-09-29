import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
await mkdir('outputs', { recursive: true });
try {
  for (const { width, role } of [
    ...[360, 768, 1440].map((width) => ({ width, role: 'student' })),
    { width: 360, role: 'supervisor' }, { width: 360, role: 'admin' },
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/site-config')) body = {};
      if (path.endsWith('/public-settings')) body = { hasStudentQuranExecution: true };
      if (path.includes('dashboard-permissions')) body = { permissions: role === 'admin' ? ['calls'] : [] };
      if (path.endsWith('/quran-today')) body = { date: '2026-09-06', plan: null, todayAmounts: [] };
      if (path.includes('notifications')) body = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json: body });
    });
    const page = await context.newPage();
    await page.addInitScript((role) => {
      globalThis.localStorage.setItem('wajeh_role', role);
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('wajeh_supervisor_id', '991');
      globalThis.localStorage.setItem('wajeh_account_id', '991');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', JSON.stringify(role === 'admin' ? ['calls'] : []));
    }, role);
    await page.goto('http://127.0.0.1:3000/');
    const header = page.locator('[data-nukhab-public-header]');
    const account = header.getByRole('button', { name: 'حسابي', exact: true });
    await account.waitFor();
    assert.equal(await header.locator('nav').count(), 0);
    assert.equal(await page.locator('[data-public-primary-actions]').getByRole('button', { name: 'حسابي', exact: true }).count(), 0);
    const accountBox = await account.boundingBox();
    const themeBox = await header.getByRole('button', { name: 'تفعيل الوضع الصباحي' }).boundingBox();
    assert.ok(accountBox.x + accountBox.width <= themeBox.x, 'Account is left of theme');
    assert.ok(accountBox.height >= 44 && themeBox.height >= 44);
    await account.click();
    await page.waitForURL(/\/(portal|dashboard)(\/|$)/);
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('light'));
    await page.goto('http://127.0.0.1:3000/');
    await account.waitFor();
    assert.ok(await page.locator('html').evaluate((el) => el.classList.contains('dark')));
    await header.getByRole('button', { name: 'تفعيل الوضع الصباحي' }).click();
    await account.click();
    await page.waitForURL(/\/(portal|dashboard)(\/|$)/);
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('light'));
    await page.reload();
    if (width < 1024) await page.getByRole('button', { name: 'فتح القائمة الجانبية', exact: true }).click();
    await page.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
    await page.goto('http://127.0.0.1:3000/');
    await account.waitFor();
    assert.ok(await page.locator('html').evaluate((el) => el.classList.contains('light')));
    await header.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
    await header.getByRole('button', { name: 'تفعيل الوضع الصباحي' }).click();
    await account.click();
    await page.waitForURL(/\/(portal|dashboard)(\/|$)/);
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'));
    await page.reload();
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'));
    await page.goto('http://127.0.0.1:3000/');
    await account.waitFor();
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/theme-header-${role}-${width}.png`, animations: 'disabled' });
    await context.close();
  }
  process.stdout.write('Independent public/account themes and header layout passed at 360, 768, 1440px.\n');
} finally {
  await browser.close();
}
