import process from 'node:process';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against a local Vite server. All API traffic is fulfilled with isolated fixtures.
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required');
const browser = await chromium.launch({ headless: true });
const results = [];
const settings = { staffAttendanceSource: 'teacher', hasStudentQuranExecution: true, pointsSystemEnabled: false, culturalCompetitionSectionEnabled: false };
const evaluation = { date: '2026-09-06', students: [{ studentId: 901, studentName: 'طالب تجريبي', attendanceStatus: 'present', canSetAttendance: true }], tasks: [{ id: 801, studentId: 901, studentName: 'طالب تجريبي', taskType: 'memorization', fromPage: 3, toPage: 3, fromSurah: 2, toSurah: 2, fromAyah: 6, toAyah: 16, targetPages: 1, amount: 'البقرة من آية 6 إلى 16', repeatCount: 10 }], executionSources: { memorization: 'teacher' }, listeningEnabled: true };
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    for (const entry of [{ path: 'portal', role: 'supervisor' }, { path: 'dashboard', role: 'supervisor' }, { path: 'dashboard', role: 'reciter' }]) {
      let date = '2026-09-06';
      let present = false;
      let posts = 0;
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body = [];
        if (path.endsWith('/public-settings')) body = settings;
        else if (path.endsWith('/site-config')) body = {};
        else if (path.includes('bootstrap')) body = { settings, permissions: ['quranEvaluation'] };
        else if (path.includes('permissions')) body = { permissions: [] };
        else if (path.endsWith('/staff-attendance/me')) {
          if (route.request().method() === 'POST') { present = true; posts++; }
          body = { enabled: true, date, alreadyPresent: present, canAttend: !present, status: present ? 'present' : null, offlinePolicy: { locationRequired: false } };
        } else if (path.includes('quran-evaluation')) body = evaluation;
        else if (path.includes('notifications')) body = { notifications: [], unreadCount: 0 };
        await route.fulfill({ json: body });
      });
      const page = await context.newPage();
      const errors = [];
      await page.addInitScript(() => {
        Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => globalThis.localStorage.getItem('test_offline') !== '1' });
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await page.waitForSelector('[data-public-primary-actions]', { state: 'attached' });
      await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).waitFor();
      const singleButton = await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).boundingBox();
      assert.ok(singleButton.width >= 70 && singleButton.width <= 135, `Single login button width: ${singleButton.width}`);
      assert.ok(singleButton.height >= 44);
      await page.waitForFunction(() => globalThis.getComputedStyle(globalThis.document.querySelector('.nukhab-hero-enter')).opacity === '1');
      await page.screenshot({ path: `outputs/login-single-${width}.png`, fullPage: false });
      assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('dark')), true);
      assert.equal(await page.locator('[data-nukhab-public-header]').getByText('الترتيب', { exact: true }).count(), 0);
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth));
      await page.waitForFunction(() => globalThis.getComputedStyle(globalThis.document.querySelector('.nukhab-hero-enter')).opacity === '1');
      await page.screenshot({ path: `outputs/entry-home-${width}.png`, fullPage: false });
      await page.clock.install({ time: new Date('2026-09-06T17:00:00Z') });
      await page.evaluate(({ settings, entry }) => {
        globalThis.localStorage.setItem('wajeh_role', entry.role);
        globalThis.localStorage.setItem('wajeh_supervisor_id', '777');
        globalThis.localStorage.setItem('nukhab_web_session', '1');
        globalThis.localStorage.setItem('wajeh_dashboard_permissions', JSON.stringify(entry.path === 'dashboard' ? ['quranEvaluation'] : []));
        globalThis.localStorage.setItem('nukhab_public_settings_v1_default', JSON.stringify({ savedAt: Date.now(), value: settings }));
      }, { settings, entry });
      await page.goto(`${base}/${entry.path}/staff-attendance`);
      await page.getByRole('dialog').getByRole('button', { name: 'حاضر', exact: true }).click();
      await page.waitForURL(`**/${entry.path}/recitation-sessions`);
      assert.equal(posts, 1);
      await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).waitFor();
      assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('light')), true);
      assert.equal(await page.locator('.recitation-summary').count(), 0);
      await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).click();
      await page.locator('.recitation-summary').waitFor();
      await page.screenshot({ path: `outputs/entry-session-${entry.path}-${entry.role}-${width}.png`, fullPage: false });
      await page.reload();
      await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).waitFor();
      assert.equal(await page.locator('.recitation-summary').count(), 0);
      assert.equal(await page.getByRole('dialog').count(), 0);
      if (width < 1024) await page.getByRole('button', { name: 'فتح القائمة الجانبية', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'التحضير', exact: true }).count(), 0);
      if (width < 1024) await page.getByRole('button', { name: 'إغلاق القائمة الجانبية', exact: true }).click();
      if (width === 1440 && entry.path === 'portal') {
        await page.evaluate(() => globalThis.localStorage.setItem('test_offline', '1'));
        await page.reload();
        await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).waitFor();
        await page.getByRole('button', { name: 'التحضير', exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
        assert.equal(await page.getByRole('button', { name: 'التحضير', exact: true }).count(), 0);
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.evaluate(() => globalThis.localStorage.removeItem('test_offline'));
      }
      // Keep the app open across Riyadh midnight, then resume the window.
      date = '2026-09-07'; present = false;
      await page.clock.setSystemTime(new Date('2026-09-06T21:00:01Z'));
      await page.evaluate(() => globalThis.window.dispatchEvent(new globalThis.Event('focus')));
      await page.getByRole('dialog').getByRole('button', { name: 'حاضر', exact: true }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'إلغاء', exact: true }).click();
      if (width < 1024) await page.getByRole('button', { name: 'فتح القائمة الجانبية', exact: true }).click();
      await page.getByRole('button', { name: 'التحضير', exact: true }).filter({ visible: true }).waitFor();
      if (width === 1440 && entry.path === 'portal') {
        await page.getByRole('button', { name: 'التحضير', exact: true }).filter({ visible: true }).click();
        await page.getByRole('button', { name: 'حاضر', exact: true }).waitFor();
        await page.evaluate(() => globalThis.localStorage.setItem('test_offline', '1'));
        await page.getByRole('button', { name: 'حاضر', exact: true }).click();
        await page.waitForURL('**/portal/recitation-sessions');
        assert.equal(posts, 1);
        await page.reload();
        await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).waitFor();
        await page.getByRole('button', { name: 'التحضير', exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
        assert.equal(await page.getByRole('button', { name: 'التحضير', exact: true }).count(), 0);
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.evaluate(async () => {
          globalThis.localStorage.removeItem('test_offline');
          const { syncOfflineActions } = await import(new globalThis.URL('src/services/offlineOperationsService.js', globalThis.location.origin).href);
          await syncOfflineActions(777, { force: true });
          globalThis.localStorage.setItem('test_offline', '1');
        });
        await page.reload();
        await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).waitFor();
        await page.getByRole('button', { name: 'التحضير', exact: true }).waitFor({ state: 'hidden', timeout: 10000 });
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.evaluate(() => globalThis.localStorage.removeItem('test_offline'));
      }
      await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).filter({ visible: true }).click();
      await page.waitForURL(base + '/');
      assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('nukhab_web_session')), null);
      assert.equal(await page.locator('html').evaluate((el) => el.classList.contains('dark')), true);
      assert.deepEqual(errors, []);
      results.push({ width, entry, attendanceHiddenAfterCheckInAndReload: true, returnsNextRiyadhDay: true, amountsHiddenOnEntryAndReload: true, logoutDirect: true, offlineReloadBeforeAndAfterSync: width === 1440 && entry.path === 'portal', pageErrors: errors });
      await context.close();
  }
  }
  await writeFile('outputs/entry-ui-verification.json', JSON.stringify(results, null, 2));
  process.stdout.write(JSON.stringify(results) + '\n');
} finally { await browser.close(); }
