import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    for (const component of ['weekly', 'track']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3003/tests/fixtures/session-attendance.html');
      if (component === 'track') await page.getByRole('button', { name: 'تبديل الجلسة' }).click();
      await page.getByRole('button', { name: 'الأسبوع السابق', exact: true }).click();
      const navigator = page.getByRole('button', { name: 'اختيار الأسبوع' });
      const oldPeriod = await navigator.innerText();
      await page.getByRole('combobox', { name: 'يوم الجلسة', exact: true }).click();
      await page.getByRole('option', { name: 'الأربعاء', exact: true }).click();
      // The real settings autosave emits the event that refreshes the mounted session page.
      await navigator.click();
      await page.getByRole('group', { name: 'بدايات الأسابيع' }).getByRole('button', { name: /^الأربعاء/ }).first().waitFor();
      const weeks = page.getByRole('group', { name: 'بدايات الأسابيع' });
      assert.match(await weeks.getByRole('button', { pressed: true }).innerText(), /^الأحد/);
      assert.equal(await navigator.innerText(), oldPeriod, 'changing settings preserves the displayed historical period');
      assert.ok(await weeks.getByRole('button', { name: /^الأربعاء/ }).count() > 0, 'new sessions reflect the new day even while viewing history');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  process.stdout.write('Browser passed: settings autosave updates both calendars, recorded Sunday stays unchanged, no overflow at 390px and 1440px.\n');
} finally {
  await browser.close();
}
