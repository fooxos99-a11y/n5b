import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
const base = 'http://127.0.0.1:3038';
await mkdir('outputs/call-system', { recursive: true });
const browser = await chromium.launch({ headless: true });
const login = async (page, loginNumber) => {
  await page.goto(`${base}/login`);
  await page.getByLabel('رقم الدخول', { exact: true }).fill(loginNumber);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).click();
  await page.waitForURL('**/dashboard/**');
};
try {
  for (const width of [390, 1440]) {
    const managerContext = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const teacherContext = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [];
    for (const context of [managerContext, teacherContext]) {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
        return route.continue();
      });
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    }
    let createdId;
    try {
      const managerPage = await managerContext.newPage();
      await login(managerPage, '990001');
      await managerPage.goto(`${base}/dashboard/users?tab=teachers`);
      await managerPage.getByRole('tab', { name: 'المعلمون', exact: true }).waitFor();
      await managerPage.getByRole('button', { name: 'إضافة معلم', exact: true }).click();
      const dialog = managerPage.getByRole('dialog');
      const name = `معلم فحص الواجهة ${width}`;
      const loginNumber = `98${Date.now()}${width}`;
      await dialog.getByRole('textbox', { name: 'الاسم', exact: true }).fill(name);
      await dialog.getByRole('textbox', { name: 'رقم الدخول', exact: true }).fill(loginNumber);
      await dialog.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
      assert.equal(await dialog.getByRole('button', { name: 'الصلاحيات', exact: true }).count(), 0);
      await dialog.getByLabel('الحلقة', { exact: true }).click();
      await managerPage.getByRole('option').first().click();
      // Clear passwords before any screenshots; never capture credentials in artifacts.
      await dialog.getByLabel('كلمة المرور', { exact: true }).fill('');
      await managerPage.screenshot({ path: `outputs/call-system/teacher-form-${width}.png`, fullPage: true });
      await dialog.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
      const saved = managerPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/teachers') && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
      const response = await saved;
      assert.equal(response.status(), 201);
      const created = await response.json();
      createdId = created.id;
      assert.equal(created.role, 'teacher');
      assert.equal(created.committeeIds.length, 1);
      await managerPage.getByText(name, { exact: true }).waitFor();
      assert.equal(await managerPage.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      const teacherPage = await teacherContext.newPage();
      const overviewResponse = teacherPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/reports/overview'));
      await login(teacherPage, loginNumber);
      await teacherPage.waitForURL('**/dashboard/reports');
      assert.equal((await overviewResponse).status(), 200);
      await teacherPage.getByRole('combobox', { name: 'الفترة', exact: true }).waitFor();
      assert.equal(await teacherPage.getByRole('combobox', { name: 'الحلقة', exact: true }).count(), 0);
      const committeesResponse = await teacherContext.request.get(`${base}/api/reports/committees`);
      assert.equal(committeesResponse.status(), 200);
      assert.deepEqual((await committeesResponse.json()).map(row => String(row.id)), created.committeeIds);
      for (const path of ['/api/students', '/api/teachers', '/api/calls', '/api/reports/archives']) {
        assert.equal((await teacherContext.request.get(`${base}${path}`)).status(), 403, path);
      }
      assert.equal(await teacherPage.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      await teacherPage.screenshot({ path: `outputs/call-system/teacher-indicators-${width}.png`, fullPage: true });
      if (width < 1024) await teacherPage.getByRole('button', { name: 'فتح القائمة الجانبية', exact: true }).click();
      for (const title of ['المستخدمون', 'المكالمات', 'خطط الطلاب', 'الإعدادات']) assert.equal(await teacherPage.getByText(title, { exact: true }).count(), 0, title);
      await teacherPage.screenshot({ path: `outputs/call-system/teacher-navigation-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      assert.equal((await teacherContext.request.post(`${base}/api/auth/logout`)).status(), 200);
      console.log(`Teacher actual UI creation, login, scoped indicators, API denials and responsive navigation passed at ${width}px.`);
    } finally {
      if (createdId) assert.equal((await managerContext.request.delete(`${base}/api/teachers/${createdId}`)).status(), 200);
      await managerContext.request.post(`${base}/api/auth/logout`);
      await teacherContext.close();
      await managerContext.close();
    }
  }
} finally { await browser.close(); }
