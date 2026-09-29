import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';

const base = globalThis.process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3107';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => globalThis.console.error(error.message));
    let deletions = 0;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/public-settings')) body = { storeEnabled: true };
      if (path.endsWith('/student-news')) body = { entries: [] };
      if (path.endsWith('/quran-today')) body = { date: getBusinessDate(), plan: { id: 1 }, tasks: [], todayAmounts: [] };
      if (path.endsWith('/quran-sessions')) body = { rows: [], points: { total: 85 } };
      if (path.endsWith('/quran-level')) body = { name: 'تأهيل 1', progressPercent: 10 };
      if (path.endsWith('/store/products')) body = { storeBalance: 150, products: [{ id: 1, name: 'منتج تجريبي', pointsPrice: 75, stock: 5 }] };
      if (path.endsWith('/offline-student/bootstrap')) body = { date: getBusinessDate(), store: { enabled: true, storeBalance: 150, products: [{ id: 1, name: 'منتج تجريبي', pointsPrice: 75, stock: 5 }] } };
      if (path.endsWith('/account-deletion/me')) body = null;
      if (path.endsWith('/account-deletion') && route.request().method() === 'POST') { deletions += 1; body = { ok: true }; }
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/#student/store`);
    try { await page.getByRole('button', { name: 'شراء', exact: true }).click(); }
    catch (error) { globalThis.console.error(await page.locator('body').innerText()); throw error; }
    const dialog = page.getByRole('dialog', { name: 'تأكيد الشراء' });
    await dialog.waitFor();
    const confirm = dialog.getByRole('button', { name: 'تأكيد الشراء', exact: true });
    await confirm.click({ trial: true });
    const box = await confirm.boundingBox();
    assert.ok(await confirm.evaluate((button, box) => button.contains(globalThis.document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)), box));
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/audit-purchase-${width}.png` });
    await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.goto(`${base}/`);
    await page.getByRole('button', { name: 'قائمة حساب الطالب' }).click();
    await page.getByRole('link', { name: 'سياسة الخصوصية' }).waitFor();
    await page.getByRole('link', { name: 'شروط الاستخدام' }).waitFor();
    await page.getByRole('button', { name: 'طلب حذف الحساب', exact: true }).click();
    await page.getByRole('dialog', { name: 'طلب حذف الحساب' }).waitFor();
    assert.equal(deletions, 0, 'Opening the deletion dialog must not submit a request');
    await page.getByRole('dialog', { name: 'طلب حذف الحساب' }).getByRole('button', { name: 'إلغاء', exact: true }).click();
    assert.equal(deletions, 0);
    await context.close();
    globalThis.console.log(`Student safety UI passed at ${width}px`);
  }
} finally { await browser.close(); }
