import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { preview } from 'vite';
import { chromium, webkit } from 'playwright';

const out = 'outputs/startup-entry-20261020';
await mkdir(out, { recursive: true });
const server = await preview({ configFile: false, build: { outDir: 'dist/nukhab' },
  preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
process.stdout.write(`Local startup preview ready: ${base}\n`);
const results = [];
const settings = { reportsSectionEnabled: true, staffAttendanceSource: 'supervisor',
  studentRankingsVisible: false, familyRankingsVisible: false };
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch();
    try {
      for (const width of [390, 1440]) {
        for (const role of ['guest', 'student']) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
          process.stdout.write(`Checking ${engine} ${role} ${width}.\n`);
          const page = await context.newPage();
          page.setDefaultTimeout(30000);
          const errors = [], writes = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') process.stderr.write(`${message.text()}\n`); });
          await page.addInitScript(role => {
            if (role === 'student') for (const [key, value] of Object.entries({ wajeh_role: role,
              wajeh_student_id: '991', wajeh_account_id: '991', wajeh_name: 'طالب الاختبار', nukhab_web_session: '1' })) globalThis.localStorage.setItem(key, value);
            globalThis.entryFrames = [];
            globalThis.entryFinished = 0;
            globalThis.addEventListener('nukhab-startup-finished', () => { globalThis.entryFinished++; });
            const sample = () => {
              globalThis.entryFrames.push({ boot: Boolean(globalThis.document.querySelector('#startup-splash')),
                repeatedBrand: globalThis.document.querySelectorAll('.loading-logo').length });
              globalThis.requestAnimationFrame(sample);
            };
            globalThis.requestAnimationFrame(sample);
          }, role);
          let releaseLogin, loginRequests = 0;
          const pendingLogin = new Promise(resolve => { releaseLogin = resolve; });
          await context.route('**/*', async route => {
            const url = new URL(route.request().url()), requestPath = url.pathname;
            if (!requestPath.includes('/api/')) return url.origin === base ? route.continue() : route.abort();
            let json = [], status = 200;
            if (requestPath.endsWith('/auth/login')) {
              loginRequests++;
              assert.deepEqual(route.request().postDataJSON(), { loginNumber: '991', password: 'test-only' });
              if (loginRequests === 1) { await pendingLogin; status = 401; json = { message: 'بيانات الدخول غير صحيحة' }; }
              else json = { role: 'manager', id: 991, name: 'مدير الاختبار', dashboardPermissions: ['reports'] };
            } else {
              if (route.request().method() !== 'GET' && !/\/offline-(student|recitation)\/bootstrap$/.test(requestPath)) writes.push(requestPath);
              if (requestPath.endsWith('/site-config')) json = {};
              if (/\/(public-settings|settings)$/.test(requestPath)) json = settings;
              if (requestPath.endsWith('/health')) json = { ok: true };
              if (requestPath.endsWith('/student-news')) json = { entries: [] };
              if (requestPath.endsWith('/quran-today')) { await delay(2800); json = { tasks: [], todayAmounts: [], plan: null }; }
              if (requestPath.endsWith('/quran-sessions')) json = { rows: [], points: { total: 0, days: [] } };
              if (requestPath.endsWith('/dashboard-bootstrap')) { await delay(400); json = { settings, permissions: ['reports'] }; }
              if (requestPath.endsWith('/reports/overview')) { await delay(400); json = { totals: {}, grades: {}, period: { from: '2026-10-20', to: '2026-10-20' } }; }
            }
            return route.fulfill({ json, status });
          });
          await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
          await page.locator('#startup-splash').waitFor({ state: 'detached', timeout: 120000 }).catch(async error => {
            await page.screenshot({ path: `${out}/failure-${engine}-${role}-${width}.png` });
            throw new Error(`Startup failed: ${JSON.stringify(errors)}`, { cause: error });
          });
          if (role === 'guest') {
            await page.getByLabel('رقم الدخول', { exact: true }).fill('991');
            await page.getByLabel('كلمة المرور', { exact: true }).fill('test-only');
            const submit = page.getByRole('button', { name: 'تسجيل دخول', exact: true });
            await submit.click();
            await page.waitForFunction(() => globalThis.document.querySelector('.account-login-form button[type="submit"]')?.disabled);
            assert.equal(await page.locator('.account-login-form').isVisible(), true, 'Login stays visible during authentication');
            assert.equal(await page.locator('[data-loading-indicator="screen"]').count(), 0);
            await page.screenshot({ path: `${out}/login-pending-${engine}-${width}.png` });
            releaseLogin();
            await page.getByText('بيانات الدخول غير صحيحة', { exact: true }).waitFor();
            assert.equal(await page.getByLabel('رقم الدخول', { exact: true }).inputValue(), '991');
            assert.equal(await page.getByLabel('كلمة المرور', { exact: true }).inputValue(), 'test-only');
            assert.equal(await submit.isEnabled(), true);
            await submit.click();
            await page.waitForURL(/\/dashboard/);
            await page.getByRole('region', { name: 'مؤشرات الأداء', exact: true }).waitFor();
            assert.equal(loginRequests, 2);
          } else {
            await page.locator('.student-home-header').waitFor();
            assert.equal(loginRequests, 0, 'Saved session does not log in again');
          }
          await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
          await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('focus')));
          await delay(250);
          const sample = await page.evaluate(() => ({ finished: globalThis.entryFinished,
            frames: globalThis.entryFrames, overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth }));
          assert.equal(sample.finished, 1, 'Startup finishes exactly once');
          assert.ok(sample.frames.every(frame => frame.repeatedBrand === 0), 'Later loaders never replay the brand');
          assert.equal(sample.overflow, false);
          assert.deepEqual(errors, []);
          assert.deepEqual(writes, []);
          await page.screenshot({ path: `${out}/ready-${engine}-${role}-${width}.png` });
          results.push({ engine, role, width, oneStartup: true, noReplayedLogo: true, loginRequests });
          process.stdout.write(`${engine} ${role} ${width}: single startup and stable login passed.\n`);
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${out}/browser.json`, JSON.stringify({ cases: results.length, physicalDevice: false, results }, null, 2));
} finally {
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
