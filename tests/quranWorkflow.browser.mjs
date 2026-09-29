import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL;
const loginNumber = process.env.QURAN_TEST_STUDENT_LOGIN;
assert.ok(base && loginNumber, 'An isolated local frontend and test student are required');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = 'outputs/quran-quality-audit/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const response = await context.request.post(`${base}/api/auth/login`, {
      headers: { 'X-Registration-Number': process.env.QURAN_TEST_REGISTRATION },
      data: { loginNumber, registrationNumber: process.env.QURAN_TEST_REGISTRATION },
    });
    assert.equal(response.status(), 200);
    const session = await response.json();
    await context.addInitScript(({ id }) => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', String(id));
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
    }, session);
    const todayResponse = await context.request.get(`${base}/api/students/${session.id}/quran-today`);
    assert.equal(todayResponse.status(), 200);
    const today = await todayResponse.json();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const openPlan = async () => {
      await page.goto(`${base}/portal/my-plan`);
      await page.locator('.student-plan-day[data-current=true]').waitFor();
      await page.locator('[data-loading-indicator]').waitFor({ state: 'hidden' });
    };
    await openPlan();
    const day = page.locator('.student-plan-day[data-current=true]');
    const layout = await day.evaluate((element) => ({
      overflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
      direction: globalThis.getComputedStyle(element).direction,
      font: globalThis.getComputedStyle(element).fontFamily,
    }));
    assert.equal(layout.overflow, false);
    assert.equal(layout.direction, 'rtl');
    await page.screenshot({ path: `${output}/plan-${width}.png`, fullPage: true });
    const amounts = [];
    for (const type of ['memorization', 'link', 'review']) {
      await openPlan();
      const button = day.locator(`[data-kind=${type}] .student-plan-amount`);
      const tasks = today.tasks.filter((task) => task.taskType === type);
      assert.ok(tasks.length, 'Choose a test student with all three task kinds');
      const box = await button.boundingBox();
      assert.ok(box.height >= 44);
      const label = await button.getAttribute('aria-label');
      for (const task of tasks) {
        assert.ok(label.includes(String(task.fromAyah)));
        assert.ok(label.includes(String(task.toAyah)));
      }
      await button.focus();
      assert.equal(await button.evaluate((element) => element === globalThis.document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.locator('.mushaf-page').first().waitFor();
      await page.locator('[data-loading-indicator]').waitFor({ state: 'hidden' });
      await page.evaluate(() => globalThis.document.fonts.ready);
      await page.locator(`.mushaf-page [data-surah="${tasks[0].fromSurah}"][data-ayah="${tasks[0].fromAyah}"]`).first().waitFor();
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      await page.screenshot({ path: `${output}/${type}-${width}.png`, fullPage: true });
      amounts.push({ type, label, touchHeight: box.height });
    }
    await page.getByRole('button', { name: 'فتح فهرس المصحف', exact: true }).click();
    await page.getByRole('textbox', { name: 'البحث في فهرس المصحف' }).fill('55:17');
    await page.getByRole('button').filter({ hasText: 'الرحمن، الآية 17' }).click();
    await page.locator('.mushaf-page [data-location="55:17:1"]').waitFor();
    await page.locator('[data-loading-indicator]').waitFor({ state: 'hidden' });
    await page.getByLabel('رقم الصفحة 531', { exact: true }).waitFor();
    assert.ok(await page.locator('.mushaf-page [data-surah="55"][data-ayah="18"]').count());
    await page.screenshot({ path: `${output}/restored-531-${width}.png`, fullPage: true });
    await openPlan();
    const beforeOffline = await day.innerText();
    await context.route('**/api/students/*/quran-*', (route) => route.abort('internetdisconnected'));
    await page.reload();
    await day.waitFor();
    assert.equal(await day.innerText(), beforeOffline, 'Cached amounts must survive an API outage');
    await context.unroute('**/api/students/*/quran-*');
    await page.reload();
    await day.waitFor();
    assert.equal(await day.innerText(), beforeOffline);
    assert.deepEqual(errors, []);
    results.push({ width, ...layout, amounts, keyboard: true, apiOutageCache: true, recovered: true, errors });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  process.stdout.write('Live Quran browser: three amounts, keyboard, touch, RTL, API outage and recovery passed at 360/768/1440px.\n');
} finally {
  await browser.close();
}
