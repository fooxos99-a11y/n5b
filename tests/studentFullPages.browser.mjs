import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const date = getBusinessDate();
    const errors = [];
    let ready;
    const rankingsGate = new Promise((resolve) => { ready = resolve; });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.includes('/rankings/')) await rankingsGate;
      if (path.endsWith('/public-settings')) body = { pointsSystemEnabled: true, storeEnabled: true, learningPathsEnabled: true };
      if (path.endsWith('/quran-today')) body = { date, plan: { id: 1, progressPercent: 2 }, tasks: [], todayAmounts: [] };
      if (path.endsWith('/quran-sessions')) body = { rows: [], points: { total: 85 } };
      if (path.endsWith('/offline-student/bootstrap')) body = { date, store: { enabled: true, storeBalance: 150, products: [{ id: 1, name: 'منتج المتجر', pointsPrice: 75, stock: 5 }] } };
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:3000/');
    await page.getByRole('status', { name: 'جارٍ فتح الحساب' }).waitFor();
    assert.equal(await page.locator('.student-home-header').isVisible(), false, 'No partial home while rankings are pending');
    ready();
    await page.locator('.student-home-main').waitFor();
    await page.goto('http://127.0.0.1:3000/#student/store');
    await page.getByRole('heading', { name: 'منتج المتجر' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'المتجر' }).count(), 0);
    const storeBox = await page.locator('.student-home-window').boundingBox();
    assert.equal(storeBox.x, 0);
    assert.equal(storeBox.width, width);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    if (width < 900) assert.equal(await page.getByRole('navigation', { name: 'تنقل الطالب' }).isVisible(), true);
    else assert.equal(await page.getByRole('button', { name: 'رجوع', exact: true }).isVisible(), true);
    await page.screenshot({ path: `outputs/student-store-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
