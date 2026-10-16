import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { gradingMaxima, gradingPolicyErrors, normalizeGradingPolicy } from '../shared/grading-policy.js';
import { getBusinessDate } from '../shared/business-date.js';

const base = process.env.POLISH_TEST_URL || 'http://127.0.0.1:5191';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = new URL('../outputs/capacitor-polish/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const date = getBusinessDate();
const mushaf = JSON.parse(await readFile(new URL('../public/quran/hafs/pages/1.json', import.meta.url), 'utf8'));
const student = { studentId: 99, studentName: 'طالب الاختبار', attendanceStatus: 'present', canSetAttendance: true };
const task = { id: 1, studentId: 99, studentName: student.studentName, planId: 1, planVersion: 1,
  taskDate: date, taskType: 'memorization', track: 'memorization', fromPage: 1, toPage: 1,
  fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, targetPages: 1, teacherCompleted: null };
const reading = { studentId: 99, status: null, expectedHizbs: 1,
  amount: { faces: 1, hizbCount: 1, ranges: [{ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 }] } };
const evaluation = (patch = {}) => ({ date, students: [student], tasks: [task], taskQueue: [task], reading: [],
  recitationAttendanceSource: 'teacher', executionSources: { memorization: 'teacher', review: 'teacher', link: 'teacher', repeat: 'teacher' },
  evaluationModes: { memorization: 'count', mastery: 'count', review: 'count', link: 'count' }, gradingPolicy: normalizeGradingPolicy(), ...patch });

async function openPage(browser, width, view, state = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    globalThis.localStorage.setItem('wajeh_role', 'supervisor');
    globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
    globalThis.localStorage.setItem('nukhab_web_session', '1');
  });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => { errors.push(error.message); globalThis.console.error(`${view}/${width}: ${error.stack}`); });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, base, 'Browser fixtures must never contact production');
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/grading/policy')) {
      if (state.deny) return route.fulfill({ status: 403, json: { message: 'لا تملك صلاحية الإعدادات' } });
      if (route.request().method() === 'PUT') {
        const policy = route.request().postDataJSON().policy;
        state.requests.push(policy);
        if (state.fail) return route.fulfill({ status: 503, json: { message: 'تعذر حفظ إعدادات الاختبار' } });
        const errors = gradingPolicyErrors(policy);
        if (Object.keys(errors).length) return route.fulfill({ status: 422, json: { message: Object.values(errors)[0] } });
        state.policy = policy;
      }
      return route.fulfill({ json: { policy: state.policy } });
    }
    if (url.pathname.endsWith('/quran-evaluation')) return route.fulfill(state.deny
      ? { status: 403, json: { message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' } }
      : { json: state.evaluation });
    if (url.pathname.endsWith('/chapters')) return route.fulfill({ json: [{ number: 1, name: 'الفاتحة', ayahCount: 7 }] });
    if (url.pathname.endsWith('/ayahs')) return route.fulfill({ json: { pages: [mushaf], wordMarks: [],
      allowedRange: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 } } });
    if (url.pathname.endsWith('/attendance') || url.pathname.endsWith('/quran-evaluation/reading')) {
      return route.fulfill({ status: 503, json: { message: 'اختبار فشل التسليم مع بقاء الحفظ المحلي' } });
    }
    if (url.pathname.includes('/batch')) return route.fulfill({ status: 503, json: { message: 'اختبار انقطاع المزامنة' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}/tests/fixtures/capacitor-polish.html?view=${view}&native=ios`);
  return { context, page, errors };
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 1440]) {
      const state = { policy: normalizeGradingPolicy(), requests: [] };
      const { context, page, errors } = await openPage(browser, width, 'settings', state);
      const group = page.getByRole('group', { name: 'أيام الحضور والحفظ والربط والمراجعة' });
      const openDays = () => group.locator('button[aria-expanded]').click();
      const day = (name) => page.getByRole('button', { name, exact: true });
      const status = page.getByTestId('autosave-status');
      await group.waitFor();
      assert.equal(state.requests.length, 0, 'Opening settings must never save');
      await openDays();
      assert.equal(await page.locator('.select-content-solid').evaluate((node) => globalThis.getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'The day menu must not reveal the fields behind it');
      assert.equal(await page.locator('.dashboard-header').evaluate((node) => globalThis.getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'The native status area uses an opaque header surface');
      await day('الأحد').tap();
      assert.equal(await day('الأحد').getAttribute('aria-pressed'), 'false');
      await page.waitForFunction((node) => globalThis.getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)', await day('الأحد').elementHandle());
      assert.equal(await day('الأحد').evaluate((node) => globalThis.getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'Touch hover must not impersonate selection');
      await status.filter({ hasText: 'saved' }).waitFor();
      assert.equal(state.requests.length, 1);
      assert.equal(state.policy.weeklyProgram.workDays.includes(0), false);
      await page.reload();
      await group.waitFor();
      await openDays();
      assert.equal(await day('الأحد').getAttribute('aria-pressed'), 'false', 'Server readback preserves deselection');
      await day('الأحد').tap();
      await status.filter({ hasText: 'saved' }).waitFor();
      await day('الجمعة').tap();
      await page.keyboard.press('Escape');
      await page.getByText('مجموع الدرجات يجب ألا يتجاوز 100.', { exact: true }).waitFor();
      assert.match(await page.getByText(/^إجمالي الدرجات:/).textContent(), /١٠٤|104/);
      const beforeInvalid = state.requests.length;
      await page.waitForTimeout(850);
      assert.equal(state.requests.length, beforeInvalid, 'Invalid totals must never be submitted');
      await page.getByRole('button', { name: /^خفض الهامش إلى/ }).click();
      await status.filter({ hasText: 'saved' }).waitFor();
      assert.equal(state.policy.generalMargin, 16);
      assert.equal(gradingMaxima(state.policy).total, 100);
      assert.equal(state.policy.weeklyProgram.workDays.length, 6);
      await openDays();
      state.fail = true;
      await day('الخميس').tap();
      await page.keyboard.press('Escape');
      await status.filter({ hasText: 'error' }).waitFor();
      assert.equal(state.policy.weeklyProgram.workDays.includes(4), true, 'A failed write must not alter persisted data');
      state.fail = false;
      await openDays();
      await day('الخميس').tap();
      await day('الخميس').tap();
      await day('الخميس').tap();
      await page.keyboard.press('Escape');
      await status.filter({ hasText: 'saved' }).waitFor();
      assert.equal(state.policy.weeklyProgram.workDays.includes(4), true);
      const countBeforeExcess = state.requests.length;
      await page.getByLabel('درجة القراءة الذاتية اليومية', { exact: true }).fill('100');
      await status.filter({ hasText: 'error' }).waitFor();
      assert.equal(await page.getByRole('button', { name: /^خفض الهامش إلى/ }).count(), 0, 'Insufficient margin cannot be made negative');
      await page.waitForTimeout(850);
      assert.equal(state.requests.length, countBeforeExcess);
      await page.reload();
      await group.waitFor();
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      await page.screenshot({ path: fileURLToPath(new URL(`settings-${engineName}-${width}.png`, output)) });
      if (width < 1024) {
        await page.getByRole('button', { name: 'فتح القائمة الجانبية' }).click();
        const drawer = page.locator('.dashboard-sidebar-content').last();
        const logout = drawer.getByRole('button', { name: 'تسجيل الخروج', exact: true });
        await logout.waitFor();
        await page.waitForFunction((node) => Math.abs(node.getBoundingClientRect().right - globalThis.innerWidth) < 1, await drawer.elementHandle());
        const box = await logout.boundingBox();
        assert.ok(box.y + box.height <= 844 - 34, 'Logout stays above the home indicator');
        assert.equal(await drawer.evaluate((node) => globalThis.getComputedStyle(node).paddingTop), '47px');
        assert.equal(await page.evaluate(() => globalThis.getComputedStyle(globalThis.document.body, '::after').content), 'none');
        await page.screenshot({ path: fileURLToPath(new URL(`drawer-light-${engineName}.png`, output)) });
        await drawer.getByRole('button', { name: 'تفعيل الوضع الليلي' }).click();
        await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'));
        await page.screenshot({ path: fileURLToPath(new URL(`drawer-dark-${engineName}.png`, output)) });
        await drawer.getByRole('button', { name: 'إغلاق القائمة الجانبية' }).click();
        await page.waitForFunction(() => globalThis.document.documentElement.dataset.nativeSidebar === 'closed');
        await drawer.waitFor({ state: 'hidden' });
        await page.setViewportSize({ width: 844, height: 390 });
        await page.getByRole('button', { name: 'فتح القائمة الجانبية' }).click();
        const landscape = await logout.boundingBox();
        assert.ok(landscape.y + landscape.height <= 390 - 34);
        await page.screenshot({ path: fileURLToPath(new URL(`drawer-landscape-${engineName}.png`, output)) });
      }
      assert.deepEqual(errors, []);
      results.push({ engine: engineName, width, flow: 'days-budget-save-failure-retry-safe-areas' });
      await context.close();
    }
    const scenarios = [
      ['reading-only', evaluation({ students: [{ ...student, attendanceStatus: '', canSetAttendance: false, readingOnly: true }], tasks: [], taskQueue: [], reading: [reading] })],
      ['present', evaluation({ students: [{ ...student, canSetAttendance: false }], tasks: [task, { ...task, id: 3, taskType: 'review' }, { ...task, id: 4, taskType: 'link' }], reading: [reading] })],
      ['attendance-required', evaluation({ students: [{ ...student, attendanceStatus: '' }] })],
      ['reading-awaiting-attendance', evaluation({ students: [{ ...student, attendanceStatus: '', canSetAttendance: false }], reading: [reading] })],
      ['mushaf', evaluation({ evaluationModes: { memorization: 'mushaf' } })],
      ['absent', evaluation({ students: [{ ...student, attendanceStatus: 'absent' }] })],
      ['sync-blocked', evaluation({ students: [{ ...student, offlineSequenceBlocked: true }] })],
      ['denied', null],
    ];
    for (const width of [320, 390, 1440]) for (const [name, data] of scenarios) {
      const { context, page, errors } = await openPage(browser, width, 'session', { evaluation: data, deny: name === 'denied' });
      if (name === 'denied') {
        await page.getByText('جلسات التسميع متاحة لصاحب الحساب فقط.', { exact: true }).waitFor();
        assert.equal(await page.getByText(student.studentName, { exact: true }).count(), 0);
      } else {
        await page.getByText(student.studentName, { exact: true }).waitFor();
        if (name === 'reading-only') {
          assert.equal(await page.getByRole('combobox', { name: /^تحضير/ }).count(), 0);
          assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
          await page.getByRole('button', { name: 'الذاتي', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          assert.equal(await page.getByRole('button', { name: 'حفظ القراءة', exact: true }).isEnabled(), true);
          await page.waitForFunction((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= globalThis.innerWidth && globalThis.getComputedStyle(node).opacity === '1';
          }, await page.getByRole('dialog').elementHandle());
          await page.getByRole('button', { name: 'حفظ القراءة', exact: true }).click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          await page.getByText('قرأ 1 حزب', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'الذاتي', exact: true }).click();
          await page.getByRole('button', { name: 'حفظ القراءة', exact: true }).click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          const localActions = await page.evaluate(() => globalThis.capacitorPolishFixture.store.getActions('default:supervisor:990'));
          assert.equal(localActions.filter((action) => action.actionType === 'self_reading').length, 1, 'Repeated offline reading reuses the same durable operation');
          await page.reload();
          await page.getByText('قرأ 1 حزب', { exact: true }).waitFor();
        } else if (name === 'present') {
          assert.equal(await page.getByLabel(`حضور ${student.studentName}`, { exact: true }).textContent(), 'حاضر');
          assert.equal(await page.getByRole('combobox', { name: /^تحضير/ }).count(), 0);
          for (const label of ['حفظ', 'مراجعة', 'ربط', 'الذاتي']) await page.getByRole('button', { name: label, exact: true }).waitFor();
          await page.getByRole('button', { name: 'حفظ', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          await page.waitForFunction((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= globalThis.innerWidth && globalThis.getComputedStyle(node).opacity === '1';
          }, await page.getByRole('dialog').elementHandle());
          await page.keyboard.press('Escape');
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
        } else if (name === 'mushaf') {
          await page.getByRole('button', { name: 'حفظ', exact: true }).click();
          const reader = page.getByLabel('جلسة التسميع', { exact: true });
          await reader.locator('[data-mushaf-word-index]').first().waitFor();
          await page.evaluate(() => globalThis.document.fonts.ready);
          const bounds = await reader.boundingBox();
          assert.equal(bounds.y, 0);
          assert.ok(Math.abs(bounds.height - 844) < 0.5, 'The reader fills the viewport within subpixel rounding');
          assert.equal(await page.evaluate(() => globalThis.getComputedStyle(globalThis.document.body, '::after').content), 'none');
          await page.screenshot({ path: fileURLToPath(new URL(`mushaf-${engineName}-${width}.png`, output)) });
        } else {
          assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
          await page.getByText({ 'attendance-required': 'حدد الحضور لبدء التسميع', 'reading-awaiting-attendance': 'بانتظار تحضير الطالب', absent: 'التسميع متاح للحاضر والمتأخر', 'sync-blocked': 'بانتظار مزامنة التسميع السابق' }[name], { exact: true }).waitFor();
          if (name === 'attendance-required') {
            await page.getByRole('combobox', { name: /^تحضير/ }).click();
            await page.getByRole('option', { name: 'حاضر', exact: true }).click();
            await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
            await page.waitForFunction((node) => !node.disabled, await page.getByRole('combobox', { name: /^تحضير/ }).elementHandle());
            const attendanceActions = await page.evaluate(() => globalThis.capacitorPolishFixture.store.getActions('default:supervisor:990'));
            assert.equal(attendanceActions.filter((action) => action.actionType === 'student_attendance' && action.status === 'failed').length, 1);
            await page.reload();
            await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
          }
          if (name === 'reading-awaiting-attendance') {
            assert.equal(await page.getByRole('button', { name: 'الذاتي', exact: true }).count(), 0);
            assert.equal(await page.getByRole('combobox', { name: /^تحضير/ }).count(), 0);
          }
        }
      }
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false, `Overflow: ${engineName}/${width}/${name}`);
      await page.screenshot({ path: fileURLToPath(new URL(`session-${name}-${engineName}-${width}.png`, output)) });
      assert.deepEqual(errors, []);
      results.push({ engine: engineName, width, flow: name });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile(new URL('browser-validation.json', output), JSON.stringify({ results, cases: results.length, physicalIphone: false, fixtureAPI: true }, null, 2));
globalThis.console.log(JSON.stringify({ passed: results.length, engines: ['chromium', 'webkit'], physicalIphone: false }));
