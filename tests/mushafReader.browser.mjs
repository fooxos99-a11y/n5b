import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => globalThis.localStorage.setItem('nukhab_student_mushaf_theme', 'dark'));
      await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:33312') + '/tests/fixtures/mushaf-reader.html');
      const openIndex = page.getByRole('button', { name: 'فتح فهرس المصحف', exact: true });
      const position = (number) => page.locator('.mushaf-page-turn').getByLabel(`رقم الصفحة ${number}`, { exact: true });
      await position(1).waitFor();
      assert.equal(await page.locator('.mushaf-reader-navigation').count(), 0);
      await page.keyboard.press('ArrowLeft');
      assert.ok(await position(1).count());
      await page.keyboard.press('ArrowRight');
      await position(2).waitFor();
      await page.waitForTimeout(250);
      await page.keyboard.press('ArrowRight');
      await position(3).waitFor();
      await page.waitForTimeout(250);
      const surface = page.locator('[data-mushaf-drag-surface]');
      const box = await surface.boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.4, { steps: 6 });
      assert.notEqual(await surface.evaluate((el) => globalThis.getComputedStyle(el).transform), 'none');
      await page.mouse.up();
      await position(4).waitFor();
      assert.equal(await page.getByRole('button', { name: 'إخفاء أدوات القراءة' }).count(), 0);
      assert.equal(await openIndex.evaluate(el => globalThis.getComputedStyle(el).color), 'rgb(255, 255, 255)');
      await openIndex.click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('dialog').evaluate(el => globalThis.getComputedStyle(el).getPropertyValue('--primary').trim()), '186 83% 27%');
      assert.equal(await page.getByRole('dialog').evaluate(el => globalThis.getComputedStyle(el).getPropertyValue('--foreground').trim()), '210 40% 98%');
      await page.keyboard.press('ArrowRight');
      assert.ok(await position(4).count());
      await page.keyboard.press('Escape');
      // Let background asset reads finish before destroying the document in WebKit.
      await page.waitForLoadState('networkidle');
      await page.reload();
      await position(4).waitFor();
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      for (const button of [openIndex]) assert.ok((await button.boundingBox()).height >= 44);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.keyboard.press('ArrowRight');
      await position(5).waitFor();
      await page.screenshot({ path: `outputs/quran-quality-audit/reader-${engine.name()}-${width}.png` });
      await openIndex.click();
      await page.getByRole('tab', { name: 'الصفحات', exact: true }).click();
      await page.getByRole('textbox', { name: 'البحث في فهرس المصحف' }).fill('604');
      await page.getByRole('button', { name: '604', exact: true }).click();
      await position(604).waitFor();

      await page.keyboard.press('ArrowRight');
      assert.ok(await position(604).count());
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
}
