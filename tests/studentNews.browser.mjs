import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
import sharp from 'sharp';
const red = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#003d51' } }).png().toBuffer();
const gold = await sharp({ create: { width: 300, height: 800, channels: 3, background: '#c49a47' } }).png().toBuffer();
const baseUrl = process.env.NEWS_TEST_URL || 'http://127.0.0.1:3017';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.clock.setFixedTime(new Date('2026-09-23T09:00:00Z'));
    let stored = { revision: 0, entries: [red, gold].map((buffer, index) => ({ id: `entry-${index}`, title: `خبر ${index + 1}`, body: 'تفاصيل الخبر للطلاب', image: `data:image/png;base64,${buffer.toString('base64')}`, committeeIds: [], startsAt: '', endsAt: '', enabled: true })) };
    await page.route('**/api/student-news**', async route => {
      const request = route.request();
      if (request.method() === 'PUT') stored = { ...request.postDataJSON(), revision: stored.revision + 1 };
      await route.fulfill({ json: request.url().endsWith('/audience') ? [{ id: 4, name: 'حلقة النور' }, { id: 5, name: 'حلقة الفجر' }] : stored });
    });
    await page.goto(`${baseUrl}/tests/fixtures/student-news.html`);
    const image = page.locator('img').first();
    await image.waitFor();
    await page.waitForFunction(() => globalThis.getComputedStyle(globalThis.document.querySelector('img')).objectFit === 'cover');
    const pictureBounds = await image.boundingBox();
    const textBounds = await page.locator('[data-news-text]').boundingBox();
    assert.ok(pictureBounds.height > 0);
    assert.ok(textBounds.y >= pictureBounds.y && textBounds.y + textBounds.height <= pictureBounds.y + pictureBounds.height + 1, 'News text overlays the image');
    assert.equal(await page.locator('[data-news-label]').textContent(), 'أخبار العائلة');
    const labelColor = await page.locator('[data-news-label]').evaluate(node => globalThis.getComputedStyle(node).color);
    const cardHeight = (await page.getByRole('region', { name: 'الأخبار', exact: true }).boundingBox()).height;
    assert.equal(await page.getByRole('heading', { name: 'خبر 1', exact: true }).isVisible(), true);
    if (width === 360) {
      await page.waitForTimeout(5200);
      assert.equal(await page.getByRole('button', { name: 'الصورة 2', exact: true }).getAttribute('aria-pressed'), 'true');
    }
    await page.getByRole('button', { name: 'الصورة 1', exact: true }).click();
    await page.getByRole('button', { name: /عرض الخبر/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.screenshot({ path: `outputs/news-card-${width}.png`, fullPage: true });
    stored.entries[0].image = '';
    await page.reload();
    await page.getByRole('heading', { name: 'خبر 1', exact: true }).waitFor();
    await page.getByRole('button', { name: 'الصورة 1', exact: true }).click();
    assert.equal(await page.locator('img').count(), 0);
    assert.equal((await page.getByRole('region', { name: 'الأخبار', exact: true }).boundingBox()).height, cardHeight);
    await page.screenshot({ path: `outputs/news-text-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /عرض الخبر/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('dialog').getByText('تفاصيل الخبر للطلاب').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.goto(`${baseUrl}/tests/fixtures/student-news.html?editor`);
    await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
    await page.getByLabel('الخبر', { exact: true }).fill('تكريم المتميزين');
    await page.getByLabel('نص الخبر', { exact: true }).fill('نص محفوظ بدون صورة');
    await page.getByLabel('لون نص الخبر', { exact: true }).fill('#ffeeaa');
    await page.getByRole('button', { name: 'بداية العرض', exact: true }).click();
    await page.getByRole('button', { name: '2026-09-24', exact: true }).click();
    await page.getByLabel('وقت بداية العرض', { exact: true }).fill('09:00');
    await page.getByRole('button', { name: 'نهاية العرض', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '2026-09-23', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'الشهر التالي', exact: true }).click();
    await page.getByRole('button', { name: '2026-10-01', exact: true }).click();
    await page.getByLabel('وقت نهاية العرض', { exact: true }).fill('18:30');
    await page.getByRole('button', { name: 'جميع الحلقات', exact: true }).click();
    await page.getByRole('button', { name: 'حلقة النور', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'حلقة الفجر', exact: true }).isVisible(), true, 'Selection keeps dropdown open');
    await page.getByRole('button', { name: 'حلقة الفجر', exact: true }).click();
    await page.getByLabel('الخبر', { exact: true }).click();
    await page.getByLabel('صورة الخبر', { exact: true }).setInputFiles({ name: 'news.png', mimeType: 'image/png', buffer: gold });
    await page.getByRole('button', { name: 'إزالة الصورة', exact: true }).click();
    await page.screenshot({ path: `outputs/news-dialog-${width}.png`, fullPage: true });
    const dialog = await page.getByRole('dialog').boundingBox();
    assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
    assert.ok(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), 'No dialog horizontal overflow');
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/student-news/manage') && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'حفظ', exact: true }).click(),
    ]);
    assert.equal(stored.entries[0].title, 'تكريم المتميزين');
    assert.equal(stored.entries[0].image, '');
    assert.equal(stored.entries[0].body, 'نص محفوظ بدون صورة');
    assert.equal(stored.entries[0].textColor, '#ffeeaa');
    assert.deepEqual(stored.entries[0].committeeIds, [4, 5]);
    assert.equal(stored.entries[0].endsAt, '2026-10-01T18:30');
    assert.equal(stored.entries[1].endsAt, '', 'Second news item retains its independent schedule');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/news-editor-${width}.png`, fullPage: true });
    await page.goto(`${baseUrl}/tests/fixtures/student-news.html`);
    await page.getByRole('heading', { name: 'تكريم المتميزين', exact: true }).waitFor();
    assert.equal(await page.locator('[data-news-text] h3').evaluate(node => globalThis.getComputedStyle(node).color), 'rgb(255, 238, 170)');
    assert.equal(await page.locator('[data-news-label]').evaluate(node => globalThis.getComputedStyle(node).color), labelColor, 'Family news label keeps the site color');
    if (width === 360) {
      stored.entries = [];
      await page.goto(`${baseUrl}/tests/fixtures/student-news.html`);
      assert.equal(await page.locator('section').count(), 0);
      assert.equal(await page.getByText(/تعذر|إعادة المحاولة/).count(), 0);
    }
    await page.close();
  }
} finally { await browser.close(); }
