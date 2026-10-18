import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
const base = 'http://127.0.0.1:3038';
const session = 'c5fb40ca-5d5a-4b0b-af34-9371ba7d8231';
await mkdir('outputs/call-system', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    for (const [number, role, path] of [
      ['990001', 'manager', '/dashboard/calls'],
      ['990002', 'reciter', '/portal/calls'],
      ['990003', 'student', '/?callArchiveRoom=2#student/calls'],
    ]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
      });
      const page = await context.newPage();
      const archiveRequests = [];
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/calls/archive')) archiveRequests.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/login`);
      await page.getByLabel('رقم الدخول', { exact: true }).fill(number);
      await page.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
      await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).click();
      await page.waitForURL(url => !url.pathname.endsWith('/login'));
      const directory = page.waitForResponse(response => new URL(response.url()).pathname === '/api/calls' && response.request().method() === 'GET');
      const target = new URL(path, base);
      target.searchParams.set('callArchiveRoom', '2');
      target.searchParams.set('callSession', session);
      await page.goto(target.href);
      const response = await directory;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).canAccessArchive, role === 'manager');
      await page.locator('#startup-splash').waitFor({ state: 'hidden' });
      if (role === 'manager') {
        await page.getByRole('tab', { name: 'الأرشيف', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'ملخص الجلسة', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'تشغيل التسجيل', exact: true }).count(), 3);
      } else {
        await page.getByRole('tab', { name: 'الغرف المفتوحة', exact: true, selected: true }).waitFor();
        assert.equal(await page.getByRole('tab', { name: 'الأرشيف', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'تشغيل التسجيل', exact: true }).count(), 0);
        assert.equal(await page.getByRole('heading', { name: 'ملخص الجلسة', exact: true }).count(), 0);
        assert.deepEqual(archiveRequests, [], 'Non-administration deep links must not load the archive');
      }
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `outputs/call-system/archive-admin-${role}-${width}.png`, fullPage: true });
      await page.evaluate(async () => {
        const { studentsApi } = await import('/src/services/studentsApi.js');
        await studentsApi.logout();
      });
      await context.close();
    }
  }
  console.log('PASS390/1440 actual local accounts: manager sees archive and three tracks; student/reciter see no archive even through a session deep link. No external provider or microphone.');
} finally { await browser.close(); }
