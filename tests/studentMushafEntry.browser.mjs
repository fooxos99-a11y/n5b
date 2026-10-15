import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { createStudentHomeFixture, initializeStudentPage, localPortalTestUrl, studentHomeResponse } from './helpers/studentHomeFixture.mjs';

const base = localPortalTestUrl();
const browser = await chromium.launch();
try {
  for (const width of [375, 1440]) {
    const { date, range, tasks } = createStudentHomeFixture();
    const originalTasks = globalThis.structuredClone(tasks);
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await initializeStudentPage(page, date);
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') writes.push(path);
      const body = path.endsWith('/site-config') ? {} : [];
      return route.fulfill(studentHomeResponse(path, { date, range, tasks, savedFailure: false, body }));
    });
    await page.goto(base);
    const assignedLink = page.locator('.student-home-today .student-home-task').filter({ hasText: 'ربط' });
    await assignedLink.waitFor();
    await assignedLink.click();
    const reader = page.getByLabel('مصحف الطالب', { exact: true });
    await reader.locator('.mushaf-page-turn').getByLabel('رقم الصفحة 2', { exact: true }).waitFor();
    assert.equal(await page.locator('.student-full-page > header').count(), 0, 'the host must not add a header above the Mushaf');
    const readerBounds = await reader.boundingBox();
    assert.ok(Math.abs(readerBounds.x) < 0.5 && Math.abs(readerBounds.y) < 0.5, 'the real reader starts at the viewport origin');
    assert.ok(Math.abs(readerBounds.width - width) < 0.5 && Math.abs(readerBounds.height - 900) < 0.5, 'the real reader fills the viewport');
    const openIndex = reader.getByRole('button', { name: 'فتح فهرس المصحف', exact: true });
    assert.equal(await openIndex.isVisible(), false);
    await reader.getByRole('button', { name: 'إظهار أدوات المصحف', exact: true }).focus();
    await page.keyboard.press('Enter');
    await openIndex.waitFor({ state: 'visible' });
    await reader.getByRole('button', { name: 'حفظ علامة الصفحة', exact: true }).click();
    await reader.getByRole('button', { name: 'إزالة علامة الصفحة', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('nukhab_student_mushaf_991_bookmarks'))), [2]);
    await reader.getByRole('button', { name: 'تفعيل المصحف الداكن', exact: true }).click();
    assert.equal(await reader.getAttribute('data-reader-theme'), 'dark');
    await openIndex.click();
    const indexDialog = page.getByRole('dialog', { name: 'فهرس المصحف', exact: true });
    await indexDialog.getByRole('tab', { name: 'العلامات', exact: true }).click();
    await indexDialog.getByRole('button', { name: 'الصفحة 2', exact: true }).click();
    await reader.getByRole('button', { name: 'إنهاء', exact: true }).click();
    await reader.waitFor({ state: 'detached' });
    assert.equal(await assignedLink.getByLabel('مكتمل', { exact: true }).count(), 0);
    assert.deepEqual(tasks, originalTasks, 'reading and finishing preserve teacher evaluation data');
    await assignedLink.click();
    await reader.locator('.mushaf-page-turn').getByLabel('رقم الصفحة 2', { exact: true }).waitFor();
    assert.equal(await reader.getAttribute('data-reader-theme'), 'dark', 'theme survives leaving and reopening the real student route');
    await reader.getByRole('button', { name: 'إظهار أدوات المصحف', exact: true }).focus();
    await page.keyboard.press('Enter');
    await reader.getByRole('button', { name: 'إزالة علامة الصفحة', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('nukhab_student_mushaf_991_bookmarks'))), []);
    await reader.getByRole('button', { name: 'إنهاء', exact: true }).click();
    await reader.waitFor({ state: 'detached' });
    assert.deepEqual(writes.filter((path) => path !== '/api/offline-student/bootstrap'), [], 'reading must not submit recitation results');
    assert.deepEqual(errors, []);
    await context.close();
    globalThis.console.log(`student route/${width}: amount entry, saved bookmarks, theme persistence and finish passed`);
  }
} finally { await browser.close(); }
