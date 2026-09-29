import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${globalThis.process.env.PORTAL_TEST_URL}/tests/fixtures/student-compact-execution.html?editable=true&cycle=true`);
    const amount = page.getByRole('combobox', { name: 'مقدار المراجعة بالأوجه' });
    await amount.click();
    assert.ok((await page.getByRole('option').allTextContents()).every(text => /^[1-9]\d*$/.test(text.trim())), 'Review choices use whole faces only');
    await page.locator('[data-radix-select-viewport]').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole('option', { name: '31', exact: true }).waitFor({ state: 'attached' });
    await page.getByRole('option', { name: '32', exact: true }).waitFor({ state: 'attached' });
    await page.getByRole('option', { name: '4', exact: true }).click();
    const button = page.getByRole('button', { name: 'مراجعة', exact: true });
    const card = button.locator('..');
    await card.getByText('ثم الناس آية 1 إلى الناس آية 2', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.compactFixture.writes.length), 0);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    const bounds = await amount.boundingBox();
    assert.ok(bounds.height >= 44);
    await card.click({ position: { x: 8, y: 8 } });
    await amount.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => globalThis.compactFixture.writes[0].reviewFaces), 4);
    await button.click();
    await amount.waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  globalThis.console.log('Review quantity, wrap preview, independent editing, card execution and undo passed at 360/768/1440px.');
} finally { await browser.close(); }
