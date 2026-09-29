import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local test server required');
const makeTask = (id, taskDate, taskType, fromPage, options = {}) => ({
  id, taskDate, sessionDate: taskDate, taskType, fromPage, toPage: fromPage, fromSurah: 2, toSurah: 2,
  fromAyah: 6, toAyah: 16, ayahPreview: 'البقرة من آية ٦ إلى ١٦', teacherCompleted: null, actualRepeatCount: 10, actualListeningCount: 3, ...options,
});
const rows = [
  makeTask(1, '2026-09-06', 'memorization', 3), makeTask(2, '2026-09-06', 'link', 5, { mistakeCount: 5, warningCount: 3 }), makeTask(3, '2026-09-06', 'review', 7, { mistakeCount: 1, warningCount: 1, teacherCompleted: false, ayahMarks: [{ markType: 'mistake', selectedText: 'إِنَّ الَّذِينَ كَفَرُوا', page: 3, startLocation: '2:6:1', endLocation: '2:6:3', notes: 'تصحيح الحرف', startAyah: 6 }, { markType: 'warning', selectedText: 'خَتَمَ اللَّهُ', notes: 'راجع المد', startAyah: 7 }] }),
  makeTask(4, '2026-09-05', 'memorization', 10, { teacherCompleted: true }), makeTask(5, '2026-09-04', 'review', 11),
  makeTask(6, '2026-08-27', 'memorization', 12), makeTask(7, '2026-09-06', 'link', 22),
];
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let date = '2026-09-06';
    let fail = false;
    let empty = false;
    let complete = false;
    let previewDate = '2026-09-07';
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (fail && (path.endsWith('/quran-today') || path.endsWith('/quran-sessions'))) return route.fulfill({ status: 500, json: { message: 'تعذر تحميل الخطة.' } });
      let body = [];
      if (path.endsWith('/site-config')) body = {};
      if (path.endsWith('/public-settings')) body = { hasStudentQuranExecution: true };
      body = mockStudentTodayResponse({ path, body, date, complete, previewDate, empty });
      if (path.endsWith('/quran-sessions')) body = { rows: empty ? [] : rows, points: { total: 1234, days: empty ? [] : [{ date, earned: 43, maximum: 45, pending: false, details: [{ label: 'الحضور', earned: 25 }, { label: 'تقييم الحفظ', earned: 18 }] }] } };
      if (path.includes('notifications')) body = { notifications: [], unreadCount: 0 };
      await route.fulfill({ json: body });
    });
    await page.clock.install({ time: new Date('2026-09-06T18:00:00Z') });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'student');
      globalThis.localStorage.setItem('wajeh_student_id', '991');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
    });
    await page.goto(`${base}/portal/my-plan`);
    await page.waitForURL('**/portal/my-plan');
    await page.locator('.student-plan-week').first().waitFor();
    assert.equal(await page.getByRole('progressbar', { name: 'تقدم الخطة' }).getAttribute('aria-valuenow'), '44');
    assert.equal(await page.locator('.dashboard-header h1').count(), 0);
    assert.equal(await page.locator('.student-plan-week').first().getAttribute('data-week'), '2026-09-06');
    const currentDay = page.locator('[data-plan-date="2026-09-06"]');
    await page.getByLabel('إجمالي النقاط: 1234', { exact: true }).waitFor();
    await currentDay.getByLabel('نقاط اليوم: 43 من 45', { exact: true }).click();
    await currentDay.getByText('الحضور', { exact: true }).waitFor();
    await currentDay.getByLabel('نقاط اليوم: 43 من 45', { exact: true }).click();
    await currentDay.locator('[data-kind=review]').getByText('(تصحيح الحرف)', { exact: true }).waitFor();
    await currentDay.locator('[data-kind=review]').getByText('(راجع المد)', { exact: true }).waitFor();
    assert.equal(await currentDay.locator('[data-kind=memorization]').getByText('(تصحيح الحرف)', { exact: true }).count(), 0);
    assert.equal((await page.locator('.student-plan-progress-percent').innerText()).replace(/\s/g, ''), '44٪');
    if(width===360) assert.equal(await page.locator('.student-plan-progress-percent').evaluate(el=>globalThis.getComputedStyle(el).fontSize),'10px');
    assert.equal(await currentDay.locator('[data-kind=review] .student-plan-feedback-counts').count(), 0);
    assert.equal(await currentDay.locator('.student-plan-feedback-quran').first().getAttribute('aria-label'), 'إِنَّ الَّذِينَ كَفَرُوا');
    await page.waitForFunction(() => globalThis.document.querySelector('.student-plan-feedback-quran')?.style.fontFamily === 'QCF-P3');
    await currentDay.getByText('5 أخطاء', { exact: true }).waitFor();
    await currentDay.getByText('3 تنبيهات', { exact: true }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'مقدار الغد' }).count(), 0);
    const currentWeekToggle = page.getByRole('button', { name: /^هذا الأسبوع/ });
    await currentWeekToggle.click();
    assert.equal(await currentDay.isVisible(), false);
    await currentWeekToggle.click();
    assert.equal(await currentDay.isVisible(), true);
    const lines = currentDay.locator('.student-plan-amount-line');
    assert.ok(await lines.evaluateAll(es=>es.every(e=>globalThis.getComputedStyle(e).whiteSpace==='nowrap')));
    const buttons = currentDay.locator('.student-plan-amount');
    assert.equal(await buttons.count(), 3);
    assert.equal(await buttons.locator('.student-plan-feedback').count(), 0, 'Feedback must stay outside amount buttons');
    await currentDay.locator('.student-plan-feedback-mark').first().click();
    assert.ok(page.url().endsWith('/portal/my-plan'), 'Feedback does not open the Mushaf');
    const boxes = await buttons.evaluateAll((elements) => elements.map((el) => { const rect = el.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }));
    assert.equal(new Set(boxes.map((box) => box.y)).size, 1);
    assert.ok(boxes.every((box) => box.width >= 44 && box.height >= 44));
    assert.equal(new Set(boxes.map(box=>box.height)).size,1,'All amount buttons have the same height, independent of notes and counts');
    assert.ok(boxes[0].x > boxes[1].x && boxes[1].x > boxes[2].x, 'RTL order');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.equal(await page.getByRole('button', { name: 'المصحف', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'الخطة والمحفوظ', exact: true }).count(), 0);
    await page.screenshot({ path: `outputs/student-plan-${width}.png`, fullPage: false });
    await page.getByRole('button', { name: /^الأسبوع/ }).first().click();
    await page.locator('[data-plan-date="2026-09-05"]').waitFor();
    for (const date of ['2026-09-05', '2026-09-04']) {
      const heading = page.locator(`[data-plan-date="${date}"] .student-plan-day-heading h3`);
      assert.ok(await heading.evaluate(el => globalThis.getComputedStyle(el).whiteSpace === 'nowrap' && el.scrollWidth <= el.clientWidth), 'Friday and Saturday fit on one line');
    }
    assert.equal(await page.locator('[data-plan-date="2026-09-05"] [data-completed="true"]').count(), 1);

    assert.equal(await page.locator('[data-completed="true"] svg').count(),0);
    const completedColor=await page.locator('[data-completed="true"]').first().evaluate(e=>globalThis.getComputedStyle(e).backgroundColor);
    assert.match(completedColor,/34, 197, 94/);

    for (const [type, targetPage] of [['memorization', 3], ['link', 5], ['review', 7]]) {
      await page.locator(`[data-plan-date="2026-09-06"] [data-kind="${type}"] .student-plan-amount`).click();
      await page.waitForURL('**/portal/mushaf');
      await page.waitForFunction((targetPage) => globalThis.document.querySelector('.mushaf-page [style*="QCF-P"]')?.getAttribute('style')?.includes(`QCF-P${targetPage}`), targetPage);
      if (type === 'link') {
        assert.equal(await page.getByRole('region', { name: 'مقاطع المقدار' }).count(), 0);
        const segments = page.locator('[aria-label="مقاطع المقدار"] button');
        assert.equal(await segments.count(), 2);
        await segments.nth(1).click();
        await page.waitForFunction(() => globalThis.document.querySelector('.mushaf-page [style*="QCF-P"]')?.getAttribute('style')?.includes('QCF-P22'));
      }
      await page.getByRole('button', { name: 'فتح فهرس المصحف', exact: true }).click();
      await page.getByRole('textbox', { name: 'البحث في فهرس المصحف' }).fill('الناس');
      await page.getByRole('dialog').getByRole('button', { name: /الناس/ }).click();
      await page.waitForFunction(() => globalThis.document.querySelector('.mushaf-page [style*="QCF-P"]')?.getAttribute('style')?.includes('QCF-P604'));
      await page.getByRole('button', { name: 'الرجوع', exact: true }).click();
      await page.waitForURL('**/portal/my-plan');
      await page.locator('.student-plan-week').first().waitFor();
    }
    if (width < 1024) await page.getByRole('button',{name:'فتح القائمة الجانبية'}).click();
    await page.evaluate(()=>{
      globalThis.headerMixedFrames=[];
      const watch=()=>{const header=globalThis.document.querySelector('.dashboard-header');if(header?.querySelector('h1')&&header?.querySelector('.student-plan-progress'))globalThis.headerMixedFrames.push(true);};
      globalThis.headerObserver=new globalThis.MutationObserver(watch);globalThis.headerObserver.observe(globalThis.document.querySelector('.dashboard-header'),{childList:true,subtree:true});
    });
    await page.getByRole('button',{name:'المكالمات',exact:true}).last().click();
    await page.waitForURL('**/portal/calls');
    assert.equal(await page.locator('.dashboard-header .student-plan-progress').count(),0);
    assert.deepEqual(await page.evaluate(()=>{globalThis.headerObserver.disconnect();return globalThis.headerMixedFrames;}),[]);
    await page.goto(`${base}/portal/my-plan`);
    await page.getByRole('progressbar',{name:'تقدم الخطة'}).waitFor();
    complete = true;
    await page.reload();
    await page.getByRole('article', { name: 'مقدار الغد' }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'مقدار الغد' }).evaluate(el => el.closest('.student-plan-week').dataset.week), '2026-09-06');
    assert.equal(await page.locator('.student-plan-day').first().getAttribute('data-plan-date'), '2026-09-07');
    await page.getByRole('article', { name: 'مقدار الغد' }).getByText('غدًا', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/student-plan-tomorrow-${width}.png`, fullPage: false });
    date = '2026-09-12';
    previewDate = '2026-09-13';
    await page.clock.setSystemTime(new Date('2026-09-12T18:00:00Z'));
    await page.reload();
    await page.getByRole('article', { name: 'مقدار الغد' }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'مقدار الغد' }).evaluate(el => el.closest('.student-plan-week').dataset.week), '2026-09-13');
    const nextWeekToggle = page.getByRole('button', { name: /^الأسبوع القادم/ });
    await nextWeekToggle.click();
    assert.equal(await page.getByRole('article', { name: 'مقدار الغد' }).isVisible(), false);
    await nextWeekToggle.click();
    assert.equal(await page.getByRole('article', { name: 'مقدار الغد' }).isVisible(), true);
    complete = false;
    date = '2026-09-07';
    await page.clock.setSystemTime(new Date('2026-09-07T00:00:01Z'));
    await page.evaluate(() => globalThis.window.dispatchEvent(new globalThis.Event('focus')));
    await page.locator('[data-plan-date="2026-09-07"]').waitFor();
    assert.equal(await page.locator('.student-plan-day').first().getAttribute('data-plan-date'), date);
    assert.equal(await page.locator('[data-plan-date="2026-09-06"] h3').textContent(), 'الأحد');
    assert.equal(await page.locator('[data-plan-date="2026-09-07"] button:disabled').count(), 3);
    date = '2026-09-13';
    await page.clock.setSystemTime(new Date('2026-09-13T10:00:00Z'));
    await page.evaluate(() => globalThis.window.dispatchEvent(new globalThis.Event('focus')));
    await page.waitForFunction(() => globalThis.document.querySelector('.student-plan-week')?.dataset.week === '2026-09-13');
    empty = true;
    await page.reload();
    await page.getByText('لا توجد خطة حالية.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    results.push({ width, progress: 44, columns: 3, opensEachAmount: true, disjointLink: true, freeSurahNavigation: true, dayRollover: true, weekRollover: true, emptyState: true });
    // Clear the account-scoped cache to exercise the first-load error path.
    if (width === 360) {
      await page.evaluate(async () => {
        const { offlineRecitationStore } = await import(new globalThis.URL('src/services/offlineRecitationStore.js', globalThis.location.origin).href);
        await offlineRecitationStore.cacheSnapshot('default:student:991:resource:student:my-plan-v1', null);
      });
      fail = true;
      await page.reload();
      await page.getByRole('alert').getByText('تعذر تحميل الخطة.', { exact: true }).waitFor();
      fail = false;
      await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
      await page.getByText('لا توجد خطة حالية.', { exact: true }).waitFor();
    }
    await context.close();
  }
  await writeFile('outputs/student-plan-browser.json', JSON.stringify(results, null, 2));
  process.stdout.write(JSON.stringify(results) + '\n');
} finally { await browser.close(); }

/** Build the selected complete or empty student-plan response for browser scenarios. */
function mockStudentTodayResponse({ path, body, date, complete, previewDate, empty }) {
  if (path.endsWith('/quran-today')) body = { date, nextDay: complete ? { date: previewDate, tasks: [makeTask('preview', previewDate, 'memorization', 4)] } : null, plan: empty ? null : { id: 1, progressPercent: 44 }, todayAmounts: empty ? [] : rows.filter((row) => row.taskDate === date), repeatCount: 10, listeningCount: 3 };
  return body;
}
