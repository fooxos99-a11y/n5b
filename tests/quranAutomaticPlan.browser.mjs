import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { defaultAutomaticTemplate, generateAutomaticRanges, resolveAutomaticRange } from '../shared/quran-automatic-plan.js';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3018';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const { ayahs, chapters } = JSON.parse(readFileSync(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
const defaults = defaultAutomaticTemplate(ayahs);
const savedPrior = resolveAutomaticRange(ayahs, { startSurah: 114, startAyah: 2, endSurah: 114, endAyah: 4 });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 1440]) {
    for (const referenceMode of ['ayah', 'page']) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      let template = defaults, failPreview = false, initialPrior = [savedPrior];
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname.split('/api')[1], method = route.request().method();
        const body = method === 'GET' ? null : route.request().postDataJSON();
        let response = [];
        if (path === '/quran/chapters') response = chapters;
        if (path === '/quran/ayahs') response = ayahs.filter(row => row.surah === Number(url.searchParams.get('surah')));
        if (path === '/quran/juz-ranges') response = [];
        if (path === '/public-settings') response = { quranReferenceMode: referenceMode, weeklyHolidayDays: [5, 6] };
        if (path === '/committees') response = [{ id: 1, name: 'حلقة اختبار' }];
        if (path === '/student-plans') response = [{ studentId: 3, studentName: 'طالب اختبار تلقائي', committeeName: 'حلقة اختبار', priorMemorization: initialPrior, plan: null }];
        if (path === '/student-plans/pause') response = { paused: false, revision: 0, canManage: false };
        if (path === '/student-plans/automatic') response = { template, defaultTemplate: defaults, canManage: true };
        if (path === '/student-plans/automatic/3/preview') {
          if (failPreview) return route.fulfill({ status: 422, json: { message: 'تعذر تجهيز الخطط التجريبية.' } });
          response = generateAutomaticRanges(ayahs, body.ranges, [...initialPrior, ...(body.priorMemorization || [])]);
        }
        if (path === '/student-plans/3' && method === 'PUT') { writes.push({ path, body }); response = { ok: true, id: 50 }; }
        if (path === '/student-plans/automatic/3/prior-memorization') { writes.push({ path, body }); response = { ok: true }; }
        await route.fulfill({ json: response });
      });
      await page.goto(`${base}/tests/fixtures/audit-settings.html?section=plans`);
      await page.getByRole('button', { name: 'إضافة خطة', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'إضافة خطة', exact: true });
      const automatic = dialog.getByRole('button', { name: 'إضافة الخطط تلقائيًا', exact: true });
      await automatic.click();
      const remaining = generateAutomaticRanges(ayahs, defaults.ranges, [savedPrior]).ranges;
      await dialog.getByText(`الخطة التالية ${remaining.length - 1}`, { exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 1);
      assert.equal(await dialog.getByRole('button', { name: /تقديم الخطة|تأخير الخطة|إزالة الخطة/ }).count(), 0);
      assert.equal(await dialog.getByText(/تُستبعد|المراحل:|تفاصيل الاستبعاد|معاينة الخطط/).count(), 0);
      assert.equal(await dialog.locator('svg.lucide-trash2,svg.lucide-arrow-up,svg.lucide-arrow-down').count(), 0);
      assert.equal(await dialog.getByText('من', { exact: true }).count(), remaining.length);
      assert.equal(await dialog.getByText('إلى', { exact: true }).count(), remaining.length);
      assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
      if (process.env.AUTOMATIC_PLAN_SCREENSHOT && referenceMode === 'ayah') await page.screenshot({ path: `${process.env.AUTOMATIC_PLAN_SCREENSHOT}-${width}.png` });
      await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
      await page.waitForFunction(() => !globalThis.document.querySelector('[role="dialog"]'));
      const saved = writes.find(item => item.path === '/student-plans/3').body;
      assert.equal(saved.automatic, true);
      assert.ok(saved.startSurah && saved.startAyah && !saved.startPage);
      assert.equal(saved.queuedRanges.length, remaining.length - 1);
      assert.ok(saved.queuedRanges.every(item => item.automatic));
      await page.getByRole('button', { name: 'إضافة خطة', exact: true }).click();
      failPreview = true;
      await automatic.click();
      await page.getByText('تعذر إضافة الخطط', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('الخطة التالية 1', { exact: true }).count(), 0);
      failPreview = false;
      await automatic.click();
      await dialog.getByText('الخطة التالية 1', { exact: true }).waitFor();
      if (width === 360 && referenceMode === 'page') {
        await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
        initialPrior = [];
        template = { name: 'قالب سورة الناس', revision: 0, ranges: [resolveAutomaticRange(ayahs, { startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6 })] };
        await page.reload();
        await page.getByRole('button', { name: 'إضافة خطة', exact: true }).click();
        await page.getByRole('button', { name: 'المحفوظ المجتاز', exact: true }).click();
        const priorDialog = page.getByRole('dialog', { name: 'المحفوظ المجتاز', exact: true });
        for (const name of ['صفحة البداية', 'صفحة النهاية']) {
          await priorDialog.getByRole('combobox', { name, exact: true }).click();
          await page.getByRole('option', { name: '604', exact: true }).click();
        }
        await priorDialog.getByRole('button', { name: 'إضافة', exact: true }).click();
        await priorDialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
        await automatic.click();
        await dialog.getByRole('button', { name: 'حفظ المحفوظ فقط', exact: true }).click();
        await page.waitForFunction(() => !globalThis.document.querySelector('[role="dialog"]'));
        assert.equal(writes.filter(item => item.path === '/student-plans/3').length, 1);
      }
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      console.log(`Automatic plan UI passed: ${width}px, ${referenceMode}, original from/to fields, no descriptions/arrows/delete, exact exclusions, save and recovery.`);
      await context.close();
    }
  }
} finally { await browser.close(); }
