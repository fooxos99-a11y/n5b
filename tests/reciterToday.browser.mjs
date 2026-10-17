import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL, fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { getSaudiCalendarDate } from '../shared/business-date.js';

const base = process.env.RECITER_TEST_BASE_URL || 'http://127.0.0.1:3029';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], requests = [], created = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, options = {}) => {
        if (!String(input).endsWith('/calls/events')) return originalFetch(input, options);
        const directory = { rooms: [{ id: '47', name: 'غرفة المقرئ الدائمة', status: 'open', participants: [], isOwner: true, canClose: true }],
          committees: [], canCreate: true, canCreateGeneral: true, livekitConfigured: true };
        return new globalThis.Response(new globalThis.ReadableStream({ start(controller) {
          controller.enqueue(new globalThis.TextEncoder().encode(`data: ${JSON.stringify(directory)}\n\n`));
          options.signal?.addEventListener('abort', () => controller.close(), { once: true });
        } }), { headers: { 'content-type': 'text/event-stream' } });
      };
      if (globalThis.localStorage.getItem('reciter_browser_session_ready')) return;
      for (const [key, value] of Object.entries({ wajeh_role: 'manager', wajeh_account_id: '991', wajeh_supervisor_id: '991',
        wajeh_name: 'مدير الاختبار', nukhab_web_session: '1', theme: 'light', wajeh_dashboard_permissions: '["calls","reciters","reports"]' })) globalThis.localStorage.setItem(key, value);
      globalThis.localStorage.setItem('reciter_browser_session_ready', '1');
    });
    const rows = [{ id: 12, name: 'مقرئ الاختبار', loginNumber: '200012', committeeIds: ['1'], permissions: [], isActive: true }];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      requests.push(url);
      let json = [];
      if (path.endsWith('/health')) json = { ok: true };
      if (path.endsWith('/public-settings')) json = { staffAttendanceSource: 'supervisor' };
      if (path.endsWith('/dashboard-bootstrap')) json = { settings: { staffAttendanceSource: 'supervisor' }, permissions: ['calls', 'reciters', 'reports'] };
      if (path.endsWith('/complexes')) json = [{ id: 1, name: 'مجمع الاختبار' }];
      if (path.endsWith('/committees')) json = [{ id: 1, name: 'حلقة الاختبار', complexId: 1 }];
      if (path.endsWith('/reciters')) {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          created.push(body); rows.push({ ...body, id: 13, isActive: true }); json = { ok: true, id: 13 };
        } else json = rows;
      }
      if (path.endsWith('/dashboard-permissions/me')) json = { permissions: ['calls'] };
      if (path.endsWith('/calls')) json = { rooms: [{ id: '47', name: 'غرفة المقرئ الدائمة', status: 'open', participants: [], isOwner: true, canClose: true }],
        committees: [], canCreate: true, canCreateGeneral: true, livekitConfigured: true };
      if (path.endsWith('/reports/overview')) json = { period: { from: url.searchParams.get('from'), to: url.searchParams.get('to') }, totals: {} };
      await route.fulfill({ json });
    });
    await page.goto(`${base}/dashboard/reciters`);
    await page.getByRole('tab', { name: 'المقرئون', exact: true }).waitFor();
    await page.getByText('مقرئ الاختبار', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'إضافة مقرئ', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'الاسم', exact: true }).fill('مقرئ جديد للاختبار');
    await dialog.getByRole('textbox', { name: 'رقم الدخول', exact: true }).fill('200013');
    await dialog.getByLabel('كلمة المرور', { exact: true }).fill('local-test-password');
    await dialog.getByRole('button', { name: 'الصلاحيات', exact: true }).click();
    const callsGrant = page.getByRole('checkbox', { name: 'المكالمات', exact: true });
    assert.equal(await callsGrant.getAttribute('aria-checked'), 'true');
    assert.equal(await callsGrant.isDisabled(), true);
    for (const label of ['الطلاب', 'خطط الطلاب', 'الإحصائيات', 'الإعدادات']) assert.equal(await page.getByRole('checkbox', { name: label, exact: true }).getAttribute('aria-checked'), 'false');
    await page.getByRole('checkbox', { name: 'الطلاب', exact: true }).focus();
    await page.keyboard.press('Escape');
    await page.locator('[data-app-popover-content]').waitFor({ state: 'detached' });
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await page.locator('.app-dialog[data-state="open"]').count(), 1);
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByText('مقرئ جديد للاختبار', { exact: true }).waitFor();
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    assert.equal(created.length, 1);
    assert.deepEqual(created[0].permissions, []);
    assert.deepEqual(created[0].committeeIds, []);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    await page.screenshot({ path: fileURLToPath(new URL(`../outputs/reciter-management-${width}.png`, import.meta.url)) });
    await page.goto(`${base}/dashboard/reports`);
    await page.getByRole('combobox', { name: 'الفترة', exact: true }).click();
    const todayResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/reports/overview') && url.searchParams.get('from') === getSaudiCalendarDate() && url.searchParams.get('to') === getSaudiCalendarDate();
    });
    await page.getByRole('option', { name: 'هذا اليوم', exact: true }).click();
    await todayResponse;
    const today = requests.findLast(url => url.pathname.endsWith('/reports/overview'));
    assert.equal(today.searchParams.get('from'), getSaudiCalendarDate());
    assert.equal(today.searchParams.get('to'), getSaudiCalendarDate());
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    await page.screenshot({ path: fileURLToPath(new URL(`../outputs/indicators-today-${width}.png`, import.meta.url)) });
    assert.deepEqual(errors, []);
    await page.evaluate(() => {
      globalThis.localStorage.setItem('wajeh_role', 'reciter');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '["calls"]');
    });
    const beforePortal = requests.length;
    await page.goto(`${base}/portal/calls`);
    await page.locator('#startup-splash').waitFor({ state: 'detached' });
    await page.getByText('غرفة المقرئ الدائمة', { exact: true }).waitFor();
    assert.equal(await page.getByText('خطط الطلاب', { exact: true }).count(), 0);
    assert.equal(await page.getByText('جلسات التسميع', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('tab', { name: 'المقرئون', exact: true }).count(), 0);
    assert.equal(requests.slice(beforePortal).some(url => /\/students|\/student-plans|\/grading|\/reports\/overview/.test(url.pathname)), false);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    await page.screenshot({ path: fileURLToPath(new URL(`../outputs/reciter-calls-only-${width}.png`, import.meta.url)) });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Reciter management and real today filter: ${width}px passed`);
  }
} finally { await browser.close(); }
