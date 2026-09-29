import sharp from 'sharp';
import { encodeStoreImage } from '../server/services/storeImages.js';

// Exercise real optimized pixels and preservation of the original during metadata edits.
const imageData = await encodeStoreImage('data:image/png;base64,' + (await sharp({ create: { width: 1800, height: 1200, channels: 4, background: { r: 25, g: 140, b: 190, alpha: 0.5 } } }).png({ compressionLevel: 0 }).toBuffer()).toString('base64'));
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { URL } from 'node:url';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    let fulfilled = false;
    let savedProduct = null;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/store/configuration')) body = { storeEnabled: true, pointsSystemEnabled: true, storePurchaseDeductsRanking: false };
      if (path.endsWith('/store/products')) body = { products: [{ id: 1, name: "صورة اختبار", imageData, pointsPrice: 10, stock: 3, isActive: true }] };
      if (path.endsWith('/store/orders')) body = [{ id: 1, studentName: 'طالب اختبار', productName: 'منتج', pointsPrice: 75, fulfilled }];
      if (path.includes('/store/orders/1') && route.request().method() === 'PATCH') { fulfilled = true; body = { ok: true }; }
      if (path.endsWith('/store/products/1') && route.request().method() === 'PUT') {
        savedProduct = route.request().postDataJSON();
        body = { ...savedProduct, id: 1, imageData };
      }
      await route.fulfill({ json: body });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/store-management.html');
    const image = page.getByRole('img', { name: 'صورة اختبار', exact: true });
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = globalThis.document.querySelector('img[alt="صورة اختبار"]');
      return img?.complete && img.naturalWidth === 1200;
    });
    assert.equal(await image.getAttribute('loading'), 'lazy');
    await page.getByRole('button', { name: 'تعديل', exact: true }).click();
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.ok(savedProduct);
    assert.equal(Object.hasOwn(savedProduct, 'imageData'), false);
    await page.getByRole('button', { name: 'طلبات الطلاب' }).click();
    await page.getByRole('button', { name: 'قبول', exact: true }).click();
    await page.getByText('لا توجد طلبات طلاب.').waitFor();
    assert.equal(fulfilled, true);
    await page.reload();
    await page.getByRole('button', { name: 'طلبات الطلاب' }).click();
    await page.getByText('لا توجد طلبات طلاب.').waitFor();
    if (width < 768) await page.getByRole('button', { name: 'إعدادات المتجر' }).click();
    await page.getByRole('switch', { name: 'تفعيل المتجر' }).waitFor();
    assert.equal(await page.getByRole('switch').count(), 2);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/store-settings-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
