import { join } from 'node:path';
import { createTemporaryArtifactDirectory } from './helpers/temporaryArtifacts.mjs';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
const artifactDirectory = createTemporaryArtifactDirectory();
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({viewport:{width, height:950}});
    await page.clock.install({time: new Date('2026-09-29T12:00:00Z')});
    const errors = [], weeks = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let body = [];
      if (url.pathname.endsWith('/committees')) body = [{id:1, name:'حلقة الاختبار'}];
      if (url.pathname.endsWith('/grading/policy')) body = {policy:normalizeGradingPolicy()};
      if (url.pathname.endsWith('/grading/week')) {
        const weekStart = url.searchParams.get('weekStart') || '2026-09-27';
        weeks.push(weekStart);
        body = {weekStart, hasPreviousWeek:true, policy:normalizeGradingPolicy(), students:[{id:1, name:'طالب الاختبار', committeeName:'حلقة الاختبار'}]};
      }
      if (url.pathname.endsWith('/grading/weekly-component')) {writes.push(route.request().postDataJSON()); body = {ok:true};}
      if (url.pathname.endsWith('/public-settings')) body = {quranReferenceMode:'page', weeklyHolidayDays:[5,6], currentTermStartDate:'2026-10-01'};
      if (url.pathname.endsWith('/student-plans')) body = [{studentId:1, studentName:'طالب الاختبار', committeeName:'حلقة الاختبار', priorMemorization:[]}];
      await route.fulfill({json:body});
    });
    const visit = section => page.goto(`${base}/tests/fixtures/weekly-refinements.html?section=${section}`);
    const fits = async section => {
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      await page.screenshot({path:join(artifactDirectory, `nukhab-weekly-${section}-${width}.png`), fullPage:true, animations:'disabled'});
    };
    for (const section of ['weekly', 'track']) {
      await visit(section);
      await page.getByText('طالب الاختبار', {exact:true}).waitFor();
      const selector = page.getByRole('button', {name:'اختيار الأسبوع', exact:true});
      assert.equal(await selector.innerText(), 'هذا الأسبوع');
      assert.equal(await page.locator('input[type="date"]').count(), 0);
      assert.equal(await page.getByRole('radio', {name:'غير مرصود', exact:true}).count(), 0);
      const present = page.getByRole('radio', {name:'حاضر', exact:true});
      const absent = page.getByRole('radio', {name:'غائب', exact:true});
      assert.ok((await present.boundingBox()).x < (await absent.boundingBox()).x);
      await Promise.all([
        page.waitForResponse(response => response.url().includes('/grading/weekly-component') && response.ok()),
        present.click(),
      ]);
      assert.equal(writes.at(-1).attended, true);
      await page.getByRole('button', {name:'الأسبوع السابق', exact:true}).click();
      await page.waitForFunction(() => globalThis.document.querySelector('[aria-label="اختيار الأسبوع"]')?.textContent === 'الأسبوع الماضي');
      assert.equal(weeks.at(-1), '2026-09-20');
      await selector.click();
      const options = page.getByRole('group', {name:'بدايات الأسابيع'}).getByRole('button');
      assert.equal(await options.count(), 4);
      assert.ok((await options.allTextContents()).every(text => text.includes('الأحد')));
      await fits(`${section}-picker`);
      await options.nth(1).click();
      await page.waitForFunction(() => globalThis.document.querySelector('[aria-label="اختيار الأسبوع"]')?.textContent === 'قبل 2 أسابيع');
      assert.equal(weeks.at(-1), '2026-09-13');
      await selector.click();
      await page.getByRole('button', {name:'هذا الأسبوع', exact:true}).click();
      await page.waitForFunction(() => globalThis.document.querySelector('[aria-label="اختيار الأسبوع"]')?.textContent === 'هذا الأسبوع');
      assert.equal(await page.getByRole('button', {name:'الأسبوع التالي', exact:true}).isDisabled(), true);
      await fits(section);
    }
    await visit('reports');
    const students = page.getByRole('region', {name:'أفضل الطلاب'});
    await students.getByText('40 درجة', {exact:true}).waitFor();
    assert.doesNotMatch(await students.innerText(), /%/);
    await page.getByRole('region', {name:'أفضل الحلقات'}).getByText('80%', {exact:true}).waitFor();
    const teachers = page.getByRole('region', {name:'المعلمون'});
    assert.equal(await teachers.getByRole('progressbar').count(), 2);
    assert.doesNotMatch(await teachers.innerText(), /تأخر|من 5|التأخير/);
    await teachers.getByRole('button', {name:/الحضور/}).click();
    await page.getByRole('dialog').getByText('التأخير', {exact:true}).waitFor();
    await fits('teacher-attendance');
    await page.getByRole('button', {name:'إغلاق التفاصيل', exact:true}).click();
    await page.locator('[role="dialog"]').waitFor({state:'detached'});
    await teachers.getByRole('button', {name:/الإنجاز/}).click();
    await page.getByRole('dialog').getByText('240', {exact:true}).waitFor();
    await page.getByRole('button', {name:'إغلاق التفاصيل', exact:true}).click();
    await page.locator('[role="dialog"]').waitFor({state:'detached'});
    await page.locator('[role="dialog"]').waitFor({state:'detached'});
    await fits('reports');
    await visit('templates');
    await page.getByText('قوالب الغياب', {exact:true}).waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(), /التنفيذ/);
    await fits('templates');
    for (const section of ['program','weekly','track']) {
      await visit(`settings-${section}`);
      await page.locator('input[type="number"]').first().waitFor();
      assert.doesNotMatch(await page.locator('main').innerText(), /مجموع الدرجات:|تظل الأسابيع/);
      await fits(`settings-${section}`);
    }
    await visit('plans');
    await page.getByText('طالب الاختبار', {exact:true}).waitFor();
    assert.equal(await page.getByRole('searchbox', {name:'ابحث بالاسم', exact:true}).getAttribute('placeholder'), 'ابحث بالاسم');
    const search = await page.getByRole('searchbox').boundingBox();
    const filter = await page.getByRole('combobox', {name:'الحلقة', exact:true}).boundingBox();
    assert.ok(Math.abs(search.y - filter.y) < 2);
    await page.getByRole('button', {name:'إضافة خطة', exact:true}).click();
    await page.getByRole('combobox', {name:'صفحة البداية', exact:true}).click();
    await page.getByRole('option', {name:'1', exact:true}).click();
    await page.getByRole('combobox', {name:'صفحة النهاية', exact:true}).click();
    await page.getByRole('option', {name:'3', exact:true}).click();
    await page.getByText('الانتهاء المتوقع: 2026-10-05', {exact:true}).waitFor();
    await fits('plans');
    assert.deepEqual(errors, []);
    await page.close();
    globalThis.console.log(`Weekly refinements passed at ${width}px`);
  }
} finally { await browser.close(); }
