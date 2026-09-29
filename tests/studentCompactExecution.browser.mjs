import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:33312') + '/tests/fixtures/student-compact-execution.html');
    await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor();
    assert.equal(await page.getByText('مقدار مكتمل مخفي').count(), 0);
    assert.equal(await page.getByRole('combobox').count(), 0, 'Locked amounts must be plain text');
    for (const label of ['حفظ', 'مراجعة', 'ربط']) {
      const button = page.getByRole('button', { name: label, exact: true });
      const card = button.locator('..');
      assert.equal(await card.locator('.student-home-execution-amount').count(), 1);
      await card.click({ position: { x: 8, y: 8 } });
      await page.waitForFunction(name => [...globalThis.document.querySelectorAll('button')].some(el => el.textContent === name && el.getAttribute('aria-pressed') === 'true' && el.getAttribute('aria-busy') === 'false'), label);
      assert.equal(await card.locator('.student-home-execution-amount').count(), 0);
      const center = await card.boundingBox();
      const text = await button.locator('span').first().boundingBox();
      assert.ok(Math.abs(center.y + center.height / 2 - text.y - text.height / 2) < 2);
      assert.ok(Math.abs(center.x + center.width / 2 - text.x - text.width / 2) < 2);
      assert.ok((await button.boundingBox()).height >= 44);
      await button.click();
      await card.locator('.student-home-execution-amount').waitFor();
    }
    await page.evaluate(() => { globalThis.compactFixture.fail = true; });
    await page.getByRole('button', { name: 'ربط', exact: true }).click();
    await page.waitForFunction(() => globalThis.document.querySelectorAll('[aria-busy="true"]').length === 0);
    assert.equal(await page.locator('.student-home-execution-amount').count(), 3);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'outputs/student-compact-' + width + '.png' });
    await page.goto((globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:33312') + '/tests/fixtures/student-compact-execution.html?editable=true');
    await page.getByRole('combobox', { name: 'آية النهاية', exact: true }).first().waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'سورة النهاية', exact: true }).count(), 0, 'Single surah must remain plain text');
    const endTrigger = page.getByRole('combobox', { name: 'آية النهاية', exact: true }).first();
    const spacing = await endTrigger.evaluate(el => {
      const number = el.querySelector('span').getBoundingClientRect();
      const surah = el.previousElementSibling.getBoundingClientRect();
      return { gap: surah.left - number.right, height: el.getBoundingClientRect().height };
    });
    assert.ok(spacing.gap >= 0 && spacing.gap <= 4, 'End ayah must sit immediately beside the surah');
    assert.ok(spacing.height >= 44, 'Inline editing keeps a touch-friendly height');
    const review = page.getByRole('button', {name:'مراجعة',exact:true}).locator('..');
    assert.equal(await review.getByRole('combobox').count(), 1, 'Review has its own ayahs only');
    await review.getByRole('combobox').click();
    await page.getByRole('option',{name:'7',exact:true}).click();
    assert.match(await review.getByRole('combobox').innerText(), /7/);
    assert.equal(await page.evaluate(()=>globalThis.compactFixture.writes.length),0,'Editing must not execute the card');
    assert.equal(await page.getByRole('button',{name:'ربط',exact:true}).locator('..').getByRole('combobox').count(),0);
    await endTrigger.click();
    await page.getByRole('option', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.waitForFunction(() => globalThis.compactFixture.writes.length > 0);
    assert.equal(await page.evaluate(() => globalThis.compactFixture.writes[0].actualEnd.ayah), 3);
    await page.close();
  }
} finally { await browser.close(); }
globalThis.console.log('Compact execution: centering, completion, undo, failed save and responsive checks passed at 360/768/1440px.');
