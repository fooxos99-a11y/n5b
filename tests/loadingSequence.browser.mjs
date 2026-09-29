import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:3017';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    for (const role of ['manager', 'admin', 'supervisor', 'reciter', 'student', 'portalTeacher', 'guest']) {
      if (process.env.LOADING_TEST_ROLE && role !== process.env.LOADING_TEST_ROLE) continue;
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const errors = [];
      let reports = 0;
      let loginAttempts = 0;
      const writes = [];
      page.on('pageerror', error => errors.push(error.message));
      if (role === 'student' && process.env.LOADING_TEST_SECTION === 'store') {
        await page.route('**/StudentStoreSection.jsx*', async route => { await delay(450); await route.continue(); });
      }
      await page.addInitScript(({ role }) => {
        globalThis.localStorage.setItem('wajeh_role', ({ portalTeacher: 'supervisor', guest: '' })[role] ?? role);
        globalThis.localStorage.setItem('wajeh_account_id', '991');
        globalThis.localStorage.setItem('wajeh_student_id', '991');
        globalThis.localStorage.setItem('wajeh_supervisor_id', '991');
        globalThis.localStorage.setItem('wajeh_name', 'حساب الاختبار');
        globalThis.localStorage.setItem('nukhab_web_session', '1');
        globalThis.localStorage.setItem('wajeh_dashboard_permissions', role === 'portalTeacher' ? '[]' : '["reports","quranEvaluation","programs"]');
        globalThis.localStorage.setItem('theme', 'light');
        globalThis.window.loadingSamples = [];
        const sample = () => {
          const screen = globalThis.document.querySelector('[data-loading-indicator="screen"]');
          const content = globalThis.document.querySelector('[data-loading-indicator="content"]');
          const cover = screen || content;
          const local = [...globalThis.document.querySelectorAll('[data-loading-indicator="local"]')].filter(node => node.checkVisibility());
          const shape = cover?.querySelector('.loading-spinner--screen');
          const rect = shape?.getBoundingClientRect();
          const style = cover ? globalThis.getComputedStyle(cover) : null;
          globalThis.window.loadingSamples.push({ screen: Boolean(screen), content: Boolean(content), background: style?.backgroundColor, opacity: style?.opacity, local: local.length, shape: shape?.className, x: rect ? rect.x + rect.width / 2 : null, y: rect ? rect.y + rect.height / 2 : null });
          globalThis.requestAnimationFrame(sample);
        };
        globalThis.requestAnimationFrame(sample);
      }, { role });
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() !== 'GET' && !/\/offline-(recitation|student)\/bootstrap$/.test(path) && !path.endsWith('/auth/login')) writes.push(path);
        let json = [];
        if (path.endsWith('/auth/login')) {
          await delay(300);
          if (++loginAttempts === 1) return route.fulfill({ status: 400, json: { message: 'تعذر الدخول' } });
          json = { role: 'manager', id: 991, name: 'حساب الاختبار', dashboardPermissions: ['reports'] };
        }
        if (!path.endsWith('/auth/login')) json = await loadingMockResponse(path);
        if (path.endsWith('/reports/overview')) {
          reports += 1;
          await delay(450);
          json = { period: { from: '2026-08-25', to: '2026-09-22' }, totals: { studentsCount: 114, familiesCount: 6 }, committeeIndicators: [] };
        }
        await route.fulfill({ json });
      });
      const paths = { student: '/', guest: '/', portalTeacher: '/portal/recitation-sessions', reciter: '/dashboard/recitation-sessions' };
      const path = paths[role] || '/dashboard/reports';
      await page.goto(base + path);
      if (role === 'guest') {
        await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
        await page.getByLabel('رقم الحساب', { exact: true }).fill('991');
        await page.getByRole('button', { name: 'دخول', exact: true }).click();
        await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'visible' });
        await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
        assert.equal(await page.getByLabel('رقم الحساب', { exact: true }).inputValue(), '991', 'failed login retains the entered account');
        await page.evaluate(() => { globalThis.window.loadingSamples = []; });
        await page.getByRole('button', { name: 'دخول', exact: true }).click();
      }
      const cover = page.locator('[data-loading-indicator="screen"]');
      await cover.waitFor({ state: 'visible' });
      await cover.waitFor({ state: 'hidden', timeout: 15000 });
      await delay(500);
      const samples = await page.evaluate(() => globalThis.window.loadingSamples);
      const first = samples.findIndex(sample => sample.screen);
      assert.ok(first >= 0, `${role}: missing loading cover`);
      const covered = samples.filter(sample => sample.screen);
      assert.ok(covered.every(sample => String(sample.background).startsWith('rgb(') && sample.opacity === '1'), `${role}: loading cover must remain fully opaque`);
      assert.equal(new Set(covered.map(sample => sample.shape)).size, 1, `${role}: shape changed`);
      assert.ok(covered.every(sample => Math.abs(sample.x - width / 2) < 2), `${role}: spinner moved horizontally`);
      assert.ok(covered.every(sample => Math.abs(sample.y - covered[0].y) < 2), `${role}: spinner moved vertically`);
      let finished = false;
      for (const sample of samples.slice(first)) {
        if (!sample.screen) finished = true;
        assert.ok(!finished || !sample.screen, `${role}: loading returned after reveal`);
        assert.equal(sample.local, 0, `${role}: local loading stage appeared`);
      }
      assert.equal(reports, ['manager', 'admin', 'supervisor'].includes(role) ? 1 : 0, `${role}: duplicate report request`);
      assert.deepEqual(errors, [], `${role}: runtime errors`);
      assert.deepEqual(writes, [], `${role}: unexpected API writes`);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false, `${role}: horizontal overflow`);
      await page.screenshot({ path: `outputs/loading-${role}-${width}.png` });
      console.info(`${role} ${width}: one stable loading sequence, no duplicate report or runtime errors`);
      if (['manager', 'admin'].includes(role)) {
        await page.getByRole('combobox', { name: 'الحلقة', exact: true }).click();
        await page.getByRole('option', { name: 'حلقة الاختبار', exact: true }).click();
        await page.waitForFunction(() => globalThis.document.querySelector('[aria-busy="true"]'));
        assert.equal(await cover.count(), 0, 'refresh must not cover existing results');
        assert.equal(await page.getByText('114', { exact: true }).count(), 1, 'results must stay mounted while refreshing');
        await page.waitForFunction(() => !globalThis.document.querySelector('[aria-busy="true"]'));
        assert.equal(reports, 2, 'filter change issues exactly one new request');
      }
      if (!['reciter', 'portalTeacher'].includes(role)) {
        await page.evaluate(() => { globalThis.window.loadingSamples = []; });
        if (role !== 'student' && width < 1024) await page.getByRole('button', { name: 'فتح القائمة الجانبية' }).click();
        if (role === 'student' && width >= 1024) await page.getByRole('button', { name: 'قائمة حساب الطالب' }).click();
        await page.getByRole('button', { name: role === 'student' && process.env.LOADING_TEST_SECTION === 'store' ? 'المتجر' : 'البرامج', exact: true }).last().click();
        const contentCover = page.locator('[data-loading-indicator="content"]');
        await contentCover.waitFor({ state: 'visible' });
        assert.equal(await cover.count(), 0, 'navigation must not cover the whole screen');
        if (role !== 'student') {
          const bounds = await contentCover.boundingBox();
          const header = await page.locator('.dashboard-header').boundingBox();
          assert.ok(bounds.y >= header.y + header.height, 'content cover stays below the header');
          assert.equal(await page.locator('.dashboard-header').evaluate(node => node.closest('[inert]') !== null), false, 'header remains interactive');
          if (width >= 1024) assert.ok(bounds.x + bounds.width <= width - 276, 'content cover does not overlap the sidebar');
        }
        await page.screenshot({ path: `outputs/loading-content-${role}-${width}.png` });
        await contentCover.waitFor({ state: 'hidden' });
        if (role === 'student' && process.env.LOADING_TEST_SECTION === 'store') await page.getByRole('heading', { name: 'منتج التحميل', exact: true }).waitFor();
        await delay(200);
        const navigation = await page.evaluate(() => globalThis.window.loadingSamples);
        const firstCover = navigation.findIndex(sample => sample.content);
        assert.ok(firstCover >= 0, 'section navigation must acquire a shared cover');
        let revealed = false;
        for (const sample of navigation.slice(firstCover)) {
          assert.equal(sample.screen, false, 'navigation must keep the shell visible');
          if (!sample.content) revealed = true;
          assert.ok(!revealed || !sample.content, 'section cover must not reappear');
          if (sample.content) assert.ok(String(sample.background).startsWith('rgb(') && sample.opacity === '1', 'navigation cover must remain fully opaque');
          assert.equal(sample.local, 0, 'section data loader must not appear separately');
        }
        assert.deepEqual(errors, [], 'navigation runtime errors');
      }
      await page.close();
    }
  }
  const stalled = await browser.newPage();
  await stalled.clock.install();
  await stalled.goto(`${base}/tests/fixtures/loading-sequence.html`);
  await stalled.locator('[data-loading-indicator="screen"]').waitFor();
  await stalled.clock.fastForward(16000);
  await stalled.getByRole('button', { name: 'إعادة المحاولة' }).waitFor();
  assert.equal(await stalled.locator('.loading-logo:visible').count(), 0, 'timeout replaces indefinite spinning with retry');
  await stalled.evaluate(() => globalThis.window.dispatchEvent(new globalThis.Event('test-loading-complete')));
  await stalled.clock.fastForward(500);
  await stalled.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
  await stalled.getByText('جاهز', { exact: true }).waitFor();
  assert.equal(await stalled.locator('[inert]').count(), 0, 'completion restores keyboard access');
  await stalled.close();
  console.info('Stalled loading exposes retry, StrictMode cleanup releases the cover and restores keyboard access.');
} finally { await browser.close(); }

async function loadingMockResponse(path) {
  let json = [];
  if (path.endsWith('/site-config')) return {};
  const settings = { reportsSectionEnabled: true, learningPathsEnabled: true, hasStudentQuranExecution: true, storeEnabled: true, pointsSystemEnabled: true, staffAttendanceSource: 'teacher', studentRankingsVisible: true, familyRankingsVisible: true };
  if (path.endsWith('/public-settings')) json = settings;
  if (path.endsWith('/reports/committees')) { await delay(750); json = [{ id: 1, name: 'حلقة الاختبار' }]; }
  if (path.endsWith('/programs/configuration')) json = { learningPathsEnabled: true };
  if (path.endsWith('/dashboard-bootstrap')) { await delay(200); json = { settings, permissions: ['reports', 'quranEvaluation', 'programs'] }; }
  if (path.endsWith('/staff-attendance/me')) { await delay(250); json = { alreadyPresent: true }; }
  if (path.endsWith('/quran-evaluation')) { await delay(500); json = { students: [], tasks: [], taskQueue: [] }; }
  if (path.endsWith('/quran-today')) { await delay(200); json = { plan: null, tasks: [], todayAmounts: [] }; }
  if (path.endsWith('/quran-sessions')) json = { rows: [], points: { total: 12, days: [] } };
  if (path.includes('/rankings/')) { await delay(650); json = [{ id: 991, name: 'طالب الاختبار', rank: 1, points: 12 }]; }
  if (path.endsWith('/programs')) { await delay(450); json = { programs: [] }; }
  if (path.endsWith('/store/products')) { await delay(900); json = { storeBalance: 100, products: [{ id: 1, name: 'منتج التحميل', pointsPrice: 10, stock: 2 }] }; }

  return json;
}
