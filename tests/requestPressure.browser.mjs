import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      let chapters = 0;
      let verses = 0;
      await context.route('**/api/quran/chapters', (route) => { chapters++; return route.fulfill({ json: [{ id: 1, name: 'الفاتحة' }] }); });
      await context.route('**/api/supervisors/11/quran-evaluation/*/ayahs', (route) => {
        verses++;
        return route.fulfill({ status: 429, headers: { 'Retry-After': '30', 'X-RateLimit-Scope': 'recitation-ayahs' }, json: { message: 'طلبات كثيرة' } });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3000/tests/fixtures/request-pressure.html');
      await page.getByRole('alert').waitFor();
      await page.evaluate(async () => {
        await Promise.all([globalThis.pressureFixture.studentsApi.getQuranChapters(), globalThis.pressureFixture.studentsApi.getQuranChapters()]);
        await globalThis.pressureFixture.studentsApi.getQuranChapters();
        await Promise.allSettled([globalThis.pressureFixture.studentsApi.getSupervisorQuranTaskAyahs(11, 1), globalThis.pressureFixture.studentsApi.getSupervisorQuranTaskAyahs(11, 1)]);
        await globalThis.pressureFixture.studentsApi.getSupervisorQuranTaskAyahs(11, 2).catch(() => null);
      });
      assert.equal(chapters, 1);
      assert.equal(verses, 1);
      const other = await context.newPage();
      await other.goto('http://127.0.0.1:3000/tests/fixtures/request-pressure.html');
      await other.getByRole('alert').waitFor();
      assert.equal(await other.evaluate(() => globalThis.pressureFixture.studentsApi.getSupervisorQuranTaskAyahs(11, 3).catch((e) => e.status)), 429);
      assert.equal(verses, 1);
      await page.evaluate(() => globalThis.pressureFixture.wait());
      const retry = page.getByRole('button', { name: /إعادة المحاولة/ });
      await page.getByRole('button', { name: /بعد/ }).waitFor();
      assert.equal(await retry.isDisabled(), true);
      await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
      assert.equal(await page.locator('output').textContent(), '1');
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
      await context.close();
    }
  } finally { await browser.close(); }
}
globalThis.console.log('Request deduplication, shared cooldown and retry UI passed Chromium/WebKit at 360/768/1440px.');
