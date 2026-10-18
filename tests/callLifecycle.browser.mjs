import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:3003';
const browser = await chromium.launch({ headless: true });
await mkdir('outputs', { recursive: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 920 }, hasTouch: true, serviceWorkers: 'block' });
    await context.route('https://**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const stats = () => page.evaluate(() => globalThis.callAudioFixture.stats());
    await page.goto(`${base}/tests/fixtures/call-audio.html`);
    await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    assert.equal((await stats()).connections, 1);
    await page.getByRole('button', { name: 'إضافة الصوت مرتين' }).click();
    assert.equal(await page.locator('audio').count(), 1);
    await page.getByRole('button', { name: 'تحديث الأب' }).click();
    await page.getByRole('button', { name: 'تصغير أو استعادة' }).click();
    await page.getByRole('button', { name: 'العودة إلى المكالمة اختبار ثبات صوت المكالمة' }).waitFor();
    assert.equal(await page.locator('audio').count(), 1);
    assert.equal((await stats()).rooms, 1);
    assert.equal((await stats()).disconnections, 0);
    await page.getByRole('button', { name: 'العودة إلى المكالمة اختبار ثبات صوت المكالمة' }).click();
    await page.getByRole('button', { name: 'بدء إعادة الاتصال', exact: true }).click();
    await page.getByText('انقطع الاتصال مؤقتًا. جارٍ إعادة الاتصال…', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'اكتمال إعادة الاتصال', exact: true }).click();
    assert.equal(await page.getByText('انقطع الاتصال مؤقتًا. جارٍ إعادة الاتصال…', { exact: true }).count(), 0);
    await page.screenshot({ path: `outputs/call-lifecycle-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'قطع الاتصال التجريبي', exact: true }).click();
    await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).waitFor();
    await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).click();
    await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    assert.equal((await stats()).connections, 2);
    await page.getByRole('button', { name: 'تأخير إشعار الخروج' }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).count(), 0, 'leaving must not wait for the API acknowledgement');
    await page.getByRole('button', { name: 'خروج أو دخول', exact: true }).click();
    await page.getByRole('button', { name: 'إفشال الاتصال التالي', exact: true }).click();
    await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
    await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).waitFor();
    await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).click();
    await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    await page.getByRole('button', { name: 'إغلاق الغرفة من الخادم' }).click();
    assert.equal(await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    for (const query of ['recording', 'legacyConsent']) {
      await page.goto(`${base}/tests/fixtures/call-audio.html?${query}`);
      await page.waitForFunction(() => globalThis.callAudioFixture.stats().tokenRequests === 1);
      assert.equal(await page.getByRole('dialog').count(), 0, 'recording must not require a confirmation dialog');
      await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
      await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
      assert.equal(await page.getByText(/التسجيل جارٍ|جارٍ تجهيز التسجيل|تعذر تحديث حالة التسجيل/).count(), 0, 'call participants see no recording notice');
      assert.equal((await stats()).tokenConsentSent, false, 'joining does not claim an explicit approval');
      assert.equal((await stats()).connections, 1);
      await page.screenshot({ path: `outputs/call-without-consent-${query}-${width}.png`, fullPage: true });
      if (query === 'recording') {
        const beforeSwitch = (await stats()).tokenRequests;
        await page.getByRole('button', { name: 'تبديل غرفة الاختبار', exact: true }).click();
        await page.waitForFunction(count => globalThis.callAudioFixture.stats().tokenRequests === count, beforeSwitch + 1);
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
        await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
        assert.equal((await stats()).connections, 2);
      }
    }
    await page.goto(`${base}/tests/fixtures/call-audio.html?setupPaused`);
    await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await stats()).connections, 0);
    assert.equal((await stats()).tokenRequests, 1, 'a server-side activation pause must still block the media connection');
    await page.goto(`${base}/tests/fixtures/student-home-preview.html?calls#student/calls`);
    await page.getByRole('button', { name: 'دخول المكالمة', exact: true }).first().click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    await page.getByLabel('إحصاءات اتصال الاختبار').getByText('غرف 1 · اتصالات 1 · خروج 0', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await page.getByRole('button', { name: 'العودة إلى المكالمة مكالمة الاختبار', exact: true }).waitFor();
    assert.equal(await page.getByLabel('إحصاءات اتصال الاختبار').textContent(), 'غرف 1 · اتصالات 1 · خروج 0');
    await page.getByRole('button', { name: 'العودة إلى المكالمة مكالمة الاختبار', exact: true }).click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).click();
    await page.getByRole('button', { name: 'دخول المكالمة', exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'دخول المكالمة', exact: true }).first().click();
    await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
    await page.screenshot({ path: `outputs/student-call-lifecycle-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false, `no horizontal overflow at ${width}`);
    await context.close();
  }
  console.log('Call lifecycle browser passed at 390/1440: stable playback and navigation, reconnect/retry, immediate leave, server close, direct entry without approval even with legacy room metadata, no recording notice, activation pause, persistent empty directory rejoin.');
} finally { await browser.close(); }
