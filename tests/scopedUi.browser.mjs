import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({viewport: {width, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let currentSection;
    const visit = async section => {
      currentSection = section;
      await page.goto(`${base}/tests/fixtures/scoped-ui.html?section=${section}`);
    };
    const fits = async () => {
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      await page.screenshot({path: `${process.env.TEMP}/nukhab-scoped-${currentSection}-${width}.png`, fullPage: true, animations: 'disabled'});
    };
    await visit('levels');
    await page.getByRole('heading', {name: 'الخريجين', exact: true}).waitFor();
    for (const name of ['التأهيل', 'النجباء', 'الفرسان', 'الحفاظ', 'الخريجين']) assert.equal(await page.getByRole('heading', {name, exact: true}).count(), 1);
    assert.equal(await page.getByText('طالب تأهيل 1', {exact: true}).count(), 0);
    const taheel = page.getByRole('region', {name:'التأهيل', exact:true}).getByRole('button');
    await taheel.focus(); await taheel.press('ArrowLeft'); await taheel.press('Enter');
    await page.getByText('طالب تأهيل 1', {exact: true}).waitFor();
    const graduates = page.getByRole('region', {name:'الخريجين', exact:true}).getByRole('button');
    await graduates.focus(); await graduates.press('ArrowRight'); await graduates.press('Enter');
    await page.getByText('طالب خريجين 3', {exact: true}).waitFor();
    assert.equal(await page.getByText('طالب تأهيل 1', {exact: true}).count(), 0);
    await fits();
    await visit('news');
    await page.getByLabel('الخبر', {exact: true}).fill('خبر تجريبي');
    assert.equal(await page.locator('input[type="date"]').count(), 2);
    assert.equal(await page.locator('input[type="time"], input[type="datetime-local"]').count(), 0);
    await page.getByLabel('بداية العرض', {exact: true}).fill('2026-09-29');
    await page.getByLabel('نهاية العرض', {exact: true}).fill('2026-09-29');
    await page.getByRole('button', {name: 'حفظ', exact: true}).click();
    assert.equal(await page.evaluate(() => globalThis.savedNews.endsAt), '2026-09-29');
    const color = await page.getByLabel('لون نص الخبر').boundingBox();
    const circles = await page.getByRole('button', {name: 'جميع الحلقات', exact: true}).boundingBox();
    assert.ok(Math.abs(color.y - circles.y) < 3, 'news color and circle controls share a row');
    await fits();
    for (const section of ['notifications', 'whatsapp']) {
      await visit(section);
      await page.getByText('طالب تجريبي', {exact: true}).waitFor();
      const send = await page.getByRole('button', {name: 'إرسال', exact: true}).boundingBox();
      const message = await page.getByLabel('نص الرسالة', {exact: true}).boundingBox();
      assert.ok(Math.abs(send.x - message.x) < 3, 'send is aligned to the left');
      assert.equal(await page.getByLabel('نص الرسالة', {exact: true}).evaluate(node => globalThis.getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.getByRole('button', {name: /^تحديد الكل/}).click();
      await page.getByRole('button', {name: 'إلغاء تحديد طالب تجريبي', exact: true}).waitFor();
      await fits();
    }
    await visit('students');
    await page.getByText('طالب تجريبي', {exact: true}).waitFor();
    assert.equal(await page.getByText(/درجة/).count(), 0);
    await page.getByRole('button', {name: 'تعديل طالب تجريبي', exact: true}).last().click();
    await page.getByText(/الرصيد الحالي:/).waitFor();
    await fits();
    await visit('term');
    const policy = page.getByRole('navigation', {name: 'الروابط النظامية'});
    await policy.getByRole('link', {name: 'سياسة الخصوصية', exact: true}).waitFor();
    assert.equal(await policy.getByRole('link', {name: 'شروط الاستخدام', exact: true}).count(), 1);
    assert.equal(await policy.getByRole('button', {name: /طلبات الحذف/}).count(), 1);
    await fits();
    let submissions = 0;
    await page.route('**/api/registration/public**', async route => {
      if (route.request().method() === 'POST') { submissions++; await route.fulfill({json: {ok: true}}); }
      else await route.fulfill({json: {enabled: true, juzRanges: []}});
    });
    await page.goto(`${base}/tests/fixtures/registration-contact.html`);
    await page.getByRole('heading', {name: 'طلب التسجيل', exact: true}).waitFor();
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('light')), true);
    await page.locator('form input').nth(0).fill('طالب التسجيل');
    await page.locator('form input').nth(3).fill('12');
    await page.getByRole('button', {name: 'إرسال الطلب', exact: true}).click();
    await page.getByRole('status').filter({hasText: 'تم إرسال الطلب بنجاح'}).first().waitFor();
    assert.equal(await page.locator('form').count(), 0);
    assert.equal(submissions, 1);
    await fits();
    assert.deepEqual(errors, []);
    await page.screenshot({path: `${process.env.TEMP}/nukhab-registration-${width}.png`});
    await page.close();
    globalThis.console.log(`Scoped UI passed at ${width}px`);
  }
} finally { await browser.close(); }
