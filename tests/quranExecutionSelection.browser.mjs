import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local test server required');

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/tests/fixtures/quran-execution-selection.html`);
      const end = page.getByRole('combobox', { name: 'صفحة النهاية' });
      await end.waitFor();
      assert.equal(await end.textContent(), '24');
      await end.click({ trial: true });
      await page.getByRole('dialog').evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished));
      });
      assert.ok((await end.boundingBox()).height >= 44);
      assert.equal(await page.getByRole('dialog').getAttribute('dir'), 'rtl');
      await end.focus();
      await end.press('Enter');
      await page.getByRole('option', { name: '32', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      const choose32 = async () => {
        await end.click();
        await page.getByRole('option', { name: '32', exact: true }).click();
        await page.getByText('تعويض: من 25 إلى 31', { exact: true }).waitFor();
        await page.getByText('زيادة: من 32 إلى 32', { exact: true }).waitFor();
      };
      await choose32();
      await page.evaluate(() => globalThis.executionFixture.student(7));
      await page.getByText('التنفيذ المختار: من 22 إلى 24', { exact: true }).waitFor();
      assert.equal(await end.textContent(), '24');
      await choose32();
      await page.evaluate(() => globalThis.executionFixture.context('2026-09-07', 28));
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.evaluate(() => globalThis.executionFixture.reopen());
      await page.getByText('التنفيذ المختار: من 22 إلى 24', { exact: true }).waitFor();
      assert.equal(await end.textContent(), '24');
      await choose32();
      const execute = page.getByRole('button', { name: 'تنفيذ', exact: true });
      assert.ok((await execute.boundingBox()).height >= 44);
      await execute.click();
      await page.getByText('التنفيذ المسجل: من 22 إلى 32', { exact: true }).waitFor();
      await page.getByText('المطلوب: من 22 إلى 24', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => globalThis.executionFixture.writes[0].actualEnd.page), 32);
      assert.equal(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
      if (width === 360) await page.screenshot({ path: `outputs/quran-execution-${engine.name()}-360.png` });
      await page.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Execution selection and breakdown passed in Chromium/WebKit at 360/768/1440px.');
