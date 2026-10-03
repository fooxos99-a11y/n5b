import { URL } from 'node:url';
import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';
import { formatHijriDate } from '../shared/hijri-calendar.js';

const base = 'http://127.0.0.1:3017';
const date = '2026-09-22';
const task = { actualFaces: 0.5, teacherCompleted: true, studentStatus: 'done', track: 'memorization', preview: 'سورة اختبار آية 1', executionState: 'complete' };
const progress = { period: { from: date, to: date, mode: 'daily' }, rows: [{ id: 1, name: 'طالب الاختبار', committeeName: 'حلقة الاختبار', tasks: Object.fromEntries(['memorization', 'review', 'link'].map(type => [type, { details: [{ date, items: [task] }] }])), dailyDetails: [{ date, attendanceStatus: 'present' }], overallPercentage: 100 }] };
const people = [{ id: 7, name: 'معلم الاختبار', role: 'supervisor' }, { id: 8, name: 'إداري الاختبار', role: 'admin' }];
const browser = await chromium.launch({ headless: true });
async function setup(width, role = 'manager', permissions = ['reports', 'students', 'supervisors', 'reciters', 'administrators']) {
  const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ role, permissions }) => {
    for (const [key, value] of Object.entries({ wajeh_role: role, wajeh_account_id: '991', wajeh_supervisor_id: '991', wajeh_name: 'اختبار', nukhab_web_session: '1', theme: 'light', wajeh_dashboard_permissions: JSON.stringify(permissions) })) globalThis.localStorage.setItem(key, value);
  }, { role, permissions });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    const path = url.pathname;
    let json = [];
    const settings = { reportsSectionEnabled: true, studentsSectionEnabled: true, usersRolesSectionEnabled: true, staffAttendanceSource: 'supervisor' };
    if (path.endsWith('/site-config')) json = {};
    if (path.endsWith('/public-settings')) json = settings;
    if (path.endsWith('/dashboard-bootstrap')) json = { settings, permissions };
    if (path.endsWith('/reports/overview')) json = { period: { from: date, to: date }, totals: {} };
    if (path.endsWith('/reports/committees')) json = [{ id: 1, name: 'حلقة الاختبار' }];
    if (path.endsWith('/reports/progress')) json = progress;
    if (path.endsWith('/reports/recitation-sessions')) json = { period: { from: date, to: date }, rows: [{ id: 1, studentId: 1, studentName: 'طالب الاختبار', sessionDate: date, taskType: 'memorization', preview: 'سورة الاختبار', teacherCompleted: true }] };
    if (path.endsWith('/reports/supervisors')) json = people.filter(person => !url.searchParams.get('staffId') || url.searchParams.get('staffId') === 'all' || String(person.id) === url.searchParams.get('staffId')).map(person => ({ ...person, recordDate: date, status: 'late', checkInTime: '16:20' }));
    await route.fulfill({ json });
  });
  return { page, errors, requests };
}
async function choose(page, label, name) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
try {
  for (const width of [360, 768, 1440]) {
    const { page, errors, requests } = await setup(width);
    await page.goto(`${base}/dashboard/reports`);
    await choose(page, 'نوع التقرير', 'جلسات التسميع');
    await page.getByText('سورة الاختبار', { exact: true }).waitFor();
    const selectors = await page.getByRole('combobox').evaluateAll(nodes => nodes.filter(node => ['نوع التقرير', 'الحلقة', 'حالة التسميع'].includes(node.getAttribute('aria-label'))).map(node => { const rect = node.getBoundingClientRect(); return { y: rect.y, width: rect.width, height: rect.height }; }));
    assert.equal(selectors.length, 3);
    assert.ok(selectors.every(rect => Math.abs(rect.y - selectors[0].y) < 2 && rect.width > 60 && rect.height >= 40));
    await page.getByRole('combobox', { name: 'نوع التقرير' }).click();
    assert.equal(await page.getByRole('option', { name: /محفوظ الطلاب/ }).count(), 0);
    await page.getByRole('option', { name: 'متابعة الطلاب', exact: true }).click();
    await page.getByText('نصف وجه', { exact: true }).filter({ visible: true }).first().waitFor();
    assert.equal(await page.getByText('سورة اختبار آية 1', { exact: false }).count(), 0);
    await choose(page, 'نوع التقرير', 'الكادر');
    await choose(page, 'اختيار الكادر', 'إداري الاختبار — إداري');
    await page.getByText('تفاصيل الأيام', { exact: true }).first().waitFor();
    await page.waitForFunction(() => globalThis.document.querySelectorAll('article').length === 1);
    const request = requests.findLast(url => url.pathname.endsWith('/reports/supervisors'));
    assert.equal(request.searchParams.get('staffId'), '8');
    assert.equal(request.searchParams.get('from'), date);
    assert.equal(request.searchParams.get('to'), date);
    await page.getByRole('button', { name: 'التاريخ من', exact: true }).click();
    await page.getByRole('button', { name: formatHijriDate('2026-09-21', { month: 'long' }), exact: true }).click();
    await page.waitForRequest(req => req.url().includes('/reports/supervisors?') && req.url().includes('from=2026-09-21'));
    await page.getByRole('button', { name: 'التاريخ إلى', exact: true }).click();
    await page.getByRole('button', { name: formatHijriDate('2026-09-23', { month: 'long' }), exact: true }).click();
    await page.waitForRequest(req => req.url().includes('/reports/supervisors?') && req.url().includes('to=2026-09-23'));
    if (width < 1024) {
      const order = await page.locator('#dashboard-header-filters').evaluate(node => globalThis.getComputedStyle(node).order);
      assert.equal(order, '-1');
    }
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    await page.screenshot({ path: `outputs/reports-staff-${width}.png` });
    await page.goto(`${base}/dashboard/reciters`);
    await page.waitForURL('**/dashboard/users?tab=reciters');
    const tabs = page.getByRole('tab');
    await page.getByRole('tab', { name: 'المقرئون', exact: true }).waitFor();
    assert.equal(await tabs.count(), 4);
    assert.equal(await page.getByRole('tab', { name: 'المقرئون', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'الإداريين', exact: true }).click();
    await page.getByRole('textbox', { name: 'ابحث باسم الإداري' }).waitFor();
    await page.getByRole('tab', { name: 'الإداريين', exact: true }).focus();
    await page.keyboard.press('Home');
    assert.equal(await page.getByRole('tab', { name: 'الطلاب', exact: true }).getAttribute('aria-selected'), 'true');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
    await page.screenshot({ path: `outputs/users-${width}.png` });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Reports and users: ${width}px passed`);
  }
  const { page, errors } = await setup(360, 'admin', ['students']);
  await page.goto(`${base}/dashboard/users?tab=administrators`);
  await page.getByRole('tab', { name: 'الطلاب', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab').count(), 1);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('Restricted administrator: unauthorized tabs absent');
} finally { await browser.close(); }
