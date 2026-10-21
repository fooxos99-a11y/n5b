import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium, webkit } from 'playwright';
const out = 'outputs/startup-stable-20261021';
await mkdir(out, { recursive: true });
const server = await preview({ configFile: false, build: { outDir: 'dist/nukhab' }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const results = [];
const settings = { reportsSectionEnabled: true, staffAttendanceSource: 'supervisor', studentRankingsVisible: false, familyRankingsVisible: false };
async function setup(browser, { width = 390, height = 844, role = '', reducedMotion = 'no-preference', expired = false, sessionFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion });
  const errors = [], requested = [];
  await context.addInitScript(accountRole => {
    if (accountRole) for (const [key, value] of Object.entries({ wajeh_role: accountRole, wajeh_student_id: '991', wajeh_account_id: '991', wajeh_supervisor_id: '991', wajeh_name: 'حساب الاختبار', nukhab_web_session: '1', wajeh_dashboard_permissions: '["reports"]' })) globalThis.localStorage.setItem(key, value);
    globalThis.startupFrames = []; globalThis.startupFinishes = 0; globalThis.firstStartup = null;
    globalThis.addEventListener('nukhab-startup-finished', () => { globalThis.startupFinishes++; });
    const frame = () => {
      const surface = globalThis.document.querySelector('#startup-splash'), logo = surface?.querySelector('img'), brand = surface?.querySelector('.startup-brand');
      if (surface && !globalThis.firstStartup) globalThis.firstStartup = surface;
      if (logo) { const rect = logo.getBoundingClientRect(), style = globalThis.getComputedStyle(brand);
        globalThis.startupFrames.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, transform: style.transform,
          same: surface === globalThis.firstStartup, count: globalThis.document.querySelectorAll('#startup-splash').length,
          opacity: style.opacity, visibility: style.visibility, inert: globalThis.document.querySelector('#app-root').inert }); }
      globalThis.requestAnimationFrame(frame);
    }; globalThis.requestAnimationFrame(frame);
  }, role);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (!path.startsWith('/api/')) return url.origin === base ? route.continue() : route.abort();
    requested.push(path);
    let json = [], status = 200;
    if (path.endsWith('/health')) json = { ok: true };
    if (path.endsWith('/site-config')) json = {};
    if (path.endsWith('/settings') || path.endsWith('/public-settings')) json = settings;
    if (path.endsWith('/dashboard-permissions/me') || path.endsWith('/dashboard-bootstrap')) {
      status = expired ? 401 : sessionFailure ? 503 : 200;
      json = status === 200 ? { settings, permissions: ['reports'] } : { message: 'تعذر التحقق من الجلسة' };
    }
    if (path.endsWith('/reports/overview')) json = { period: {}, totals: {}, grades: {} };
    if (path.endsWith('/student-news')) json = { entries: [] };
    if (path.endsWith('/quran-today')) json = { tasks: [], todayAmounts: [] };
    if (path.endsWith('/quran-sessions')) json = { rows: [], points: { total: 0, days: [] } };
    if (path.endsWith('/summit')) json = { enabled: false };
    return route.fulfill({ json, status });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors, requested, width, height };
}
async function finished(page) {
  await page.locator('#startup-splash').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#app-root').getAttribute('inert'), null);
}
async function stable(page) {
  const sample = await page.evaluate(() => ({ frames: globalThis.startupFrames, finishes: globalThis.startupFinishes, overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth }));
  assert.equal(sample.finishes, 1); assert.equal(sample.overflow, false);
  assert.ok(sample.frames.length > 3);
  const first = sample.frames[0];
  const viewport = page.viewportSize();
  assert.equal(first.width, 160); assert.equal(first.height, 192);
  assert.ok(Math.abs(first.x + first.width / 2 - viewport.width / 2) <= .5, 'logo must be horizontally centered');
  assert.ok(Math.abs(first.y + first.height / 2 - viewport.height / 2) <= .5, 'logo itself must be vertically centered');
  for (const frame of sample.frames) {
    assert.ok(frame.same && frame.count === 1 && frame.transform === 'none');
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(frame[key] - first[key]) <= .5, `logo ${key} moved`);
    if (!frame.inert) assert.ok(frame.visibility === 'hidden' || Number(frame.opacity) === 0, 'the brand must be gone before account content is exposed');
  }
  assert.equal(await page.locator('.loading-logo').count(), 0);
}
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch();
    try {
      for (const [width, height] of [[320, 640], [390, 844], [1440, 900], [844, 390]]) {
        const { context, page, errors } = await setup(browser, { width, height });
        let release; const gate = new Promise(resolve => { release = resolve; });
        await page.route('**/assets/index-*.js', async route => { await gate; await route.continue(); });
        await page.goto(base, { waitUntil: 'commit' }); await page.waitForFunction(() => Boolean(globalThis.nukhabStartup));
        await page.waitForTimeout(650);
        assert.equal(await page.evaluate(() => globalThis.nukhabStartup.active), true);
        release(); await finished(page); await page.getByLabel('رقم الدخول', { exact: true }).waitFor();
        await stable(page); assert.deepEqual(errors, []);
        if (width === 390) await page.screenshot({ path: `${out}/ready-${engine}.png` });
        results.push({ engine, width, height, scenario: 'fixed-logo-slow-bundle-and-no-overlay', passed: true }); await context.close();
      }
      for (const role of ['manager', 'student']) {
        const { context, page, errors, requested } = await setup(browser, { role });
        let release; const gate = new Promise(resolve => { release = resolve; });
        await page.route(role === 'manager' ? '**/api/reports/overview*' : '**/api/students/991/quran-today*', async route => {
          await gate; await route.fulfill({ json: role === 'manager' ? { period: {}, totals: {}, grades: {} } : { tasks: [], todayAmounts: [] } });
        });
        await page.goto(role === 'manager' ? base + '/dashboard/reports' : base); await finished(page);
        assert.equal(await page.locator(role === 'manager' ? '.dashboard-header' : '.student-home-header').isVisible(), true, 'the account shell must appear before noncritical data');
        assert.equal(await page.locator('[data-loading-indicator="screen"]').count(), 0);
        await page.screenshot({ path: `${out}/slow-${role}-${engine}.png` });
        release();
        if (role === 'manager') await page.getByRole('region', { name: 'مؤشرات الأداء', exact: true }).waitFor();
        await page.evaluate(() => { globalThis.dispatchEvent(new globalThis.Event('focus')); globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange')); });
        await page.waitForTimeout(250); await stable(page);
        assert.equal(requested.includes('/api/auth/login'), false); assert.deepEqual(errors, []);
        results.push({ engine, role, scenario: 'saved-session-local-data-loading-and-resume-without-replay', passed: true }); await context.close();
      }
      for (const role of ['manager', 'student']) {
        const { context, page, errors } = await setup(browser, { role, expired: true });
        await page.goto(role === 'manager' ? base + '/dashboard/reports' : base); await finished(page);
        await page.getByLabel('رقم الدخول', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('wajeh_role')), null);
        assert.equal(await page.locator('.student-home-header,.dashboard-header').count(), 0);
        assert.deepEqual(errors, []); results.push({ engine, role, scenario: 'expired-session-denied-and-login-shown', passed: true }); await context.close();
      }
      const failure = await setup(browser, { role: 'student', sessionFailure: true });
      await failure.page.goto(base); await finished(failure.page);
      await failure.page.getByRole('alert').getByText('تعذر التحقق من الجلسة. تحقق من الاتصال ثم أعد المحاولة.', { exact: true }).waitFor();
      assert.equal(await failure.page.locator('.student-home-header').count(), 0);
      await failure.page.route('**/api/dashboard-permissions/me', route => route.fulfill({ json: { permissions: [] } }));
      await failure.page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
      await failure.page.locator('.student-home-header').waitFor(); assert.equal(await failure.page.locator('#startup-splash').count(), 0);
      assert.deepEqual(failure.errors, []); results.push({ engine, scenario: 'session-check-failure-retry-without-brand-replay', passed: true }); await failure.context.close();
      const reduced = await setup(browser, { reducedMotion: 'reduce' });
      await reduced.page.goto(base); await finished(reduced.page);
      assert.equal(await reduced.page.evaluate(() => globalThis.document.getAnimations().some(item => /startup/.test(item.animationName || ''))), false);
      assert.deepEqual(reduced.errors, []); results.push({ engine, scenario: 'reduced-motion', passed: true }); await reduced.context.close();
    } finally { await browser.close(); }
  }
  await writeFile(`${out}/browser.json`, JSON.stringify({ physicalDevice: false, cases: results.length, results }, null, 2));
  process.stdout.write(`Startup stability: ${results.length} Chromium/WebKit scenarios passed.\n`);
} finally { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); }
