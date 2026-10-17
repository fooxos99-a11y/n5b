import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';
import { getSaudiCalendarDate } from '../shared/business-date.js';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
const base = 'http://127.0.0.1:3038';
const sessionId = 'c5fb40ca-5d5a-4b0b-af34-9371ba7d8231';
await mkdir('outputs/call-system', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [], external = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/fixtures/local-preview.html`);
    await page.getByRole('heading', { name: 'شاهد تعديلات المكالمات والمقرئين' }).waitFor();
    assert.equal(await page.getByRole('link').count(), 8);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/call-system/preview-guide-${width}.png`, fullPage: true });
    await page.goto(`${base}/login`);
    await page.getByLabel('رقم الدخول', { exact: true }).fill('990001');
    await page.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(`${base}/dashboard/reciters`);
    await page.getByText('مقرئ اختبار المكالمات', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'إضافة مقرئ', exact: true }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'الاسم', exact: true }).waitFor();
    await page.screenshot({ path: `outputs/call-system/preview-reciters-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.goto(`${base}/dashboard/reports`);
    await page.getByRole('combobox', { name: 'الفترة', exact: true }).click();
    const todayResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/reports/overview') && url.searchParams.get('from') === getSaudiCalendarDate() && url.searchParams.get('to') === getSaudiCalendarDate();
    });
    await page.getByRole('option', { name: 'هذا اليوم', exact: true }).click();
    assert.equal((await todayResponse).status(), 200);
    await page.screenshot({ path: `outputs/call-system/preview-today-${width}.png`, fullPage: true });
    await page.goto(`${base}/dashboard/calls`);
    await page.getByRole('tab', { name: 'الأرشيف', exact: true }).click();
    await page.getByRole('button', { name: /أرشيف توضيحي — معاينة محلية/ }).click();
    await page.getByRole('button', { name: /^فتح جلسة/ }).click();
    await page.getByRole('heading', { name: 'ملخص الجلسة' }).waitFor();
    assert.match(page.url(), new RegExp(sessionId));
    assert.equal(await page.getByRole('button', { name: 'تشغيل التسجيل', exact: true }).count(), 3);
    await page.getByRole('button', { name: 'تشغيل التسجيل', exact: true }).first().click();
    await page.waitForFunction(() => globalThis.document.querySelector('audio')?.readyState >= 1);
    await page.getByRole('button', { name: 'استمع إلى الملاحظة عند 0:02' }).click();
    assert.ok(await page.locator('audio').first().evaluate(audio => audio.currentTime >= 2));
    await page.getByRole('checkbox', { name: 'اعتماد الملاحظة 0:02' }).check();
    await page.getByLabel('ملاحظات المقرئ', { exact: true }).fill('مراجعة توضيحية محلية: الملاحظة مثال وليست خطأ حقيقيًا.');
    const saved = page.waitForResponse(response => response.url().endsWith(`/${sessionId}/review`) && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'حفظ المراجعة' }).click();
    assert.equal((await saved).status(), 200);
    await page.getByText('الأخطاء المعتمدة: 1', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/call-system/preview-archive-${width}.png`, fullPage: true });
    await page.goto('http://127.0.0.1:3039/tests/fixtures/call-audio.html?consent=1');
    await page.getByRole('button', { name: 'أوافق وأدخل', exact: true }).click();
    await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    await page.getByRole('button', { name: 'تصغير أو استعادة' }).click();
    await page.getByRole('button', { name: 'العودة إلى المكالمة اختبار ثبات صوت المكالمة' }).click();
    await page.getByRole('button', { name: 'بدء إعادة الاتصال' }).click();
    await page.getByText('انقطع الاتصال مؤقتًا. جارٍ إعادة الاتصال…', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'اكتمال إعادة الاتصال' }).click();
    assert.equal(await page.evaluate(() => globalThis.callAudioFixture.stats().disconnections), 0);
    await page.screenshot({ path: `outputs/call-system/preview-call-fixture-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  }
  console.log('Local preview passed390/1440: guide, real manager login/reciter form/today API, actual private archive playback+seek+review, isolated UI-only call fixture. No external APIs or microphone.');
} finally { await browser.close(); }
