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
    for (const query of ['consent', 'staleConsent']) {
      await page.goto(`${base}/tests/fixtures/call-audio.html?${query}`);
      await page.getByRole('dialog', { name: 'الموافقة على تسجيل المكالمة' }).waitFor();
      assert.equal((await stats()).connections, 0, 'consent must precede the media connection');
      if (query === 'consent') assert.equal((await stats()).tokenRequests, 0, 'known consent requirement must precede admission token issuance');
      await page.getByRole('button', { name: 'أوافق وأدخل', exact: true }).click();
      await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
      await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
      assert.equal((await stats()).tokenConsent, true);
      assert.equal((await stats()).connections, 1);
      if (query === 'consent') {
        const beforeSwitch = (await stats()).tokenRequests;
        await page.getByRole('button', { name: 'تبديل غرفة الاختبار', exact: true }).click();
        await page.getByRole('dialog', { name: 'الموافقة على تسجيل المكالمة' }).waitFor();
        assert.equal((await stats()).tokenRequests, beforeSwitch, 'consent for another room cannot carry over');
        await page.getByRole('button', { name: 'أوافق وأدخل', exact: true }).click();
        await page.getByRole('button', { name: 'إكمال الاتصال التجريبي' }).click();
        await page.getByRole('button', { name: 'الخروج من المكالمة', exact: true }).waitFor();
        assert.equal((await stats()).connections, 2);
      }
    }
    await page.goto(`${base}/tests/fixtures/call-audio.html?consent`);
    await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
    assert.equal((await stats()).connections, 0);
    assert.equal((await stats()).tokenRequests, 0);
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
  console.log('Call lifecycle browser passed at 390/1440: stable playback and navigation, reconnect/retry, immediate leave, server close, consent before media/token and stale-policy challenge, persistent empty directory rejoin.');
} finally { await browser.close(); }
