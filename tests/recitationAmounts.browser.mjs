import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:3011/tests/fixtures/recitation-amounts.html');
    await page.getByText('طالب تجريبي 4', { exact: true }).waitFor();
    const cards = page.locator('.recitation-reference-card');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    assert.ok(second.y - first.y - first.height <= 11);
    assert.ok(first.height < 70);
    const sizes = await page.locator('.recitation-amount-text, .recitation-range-trigger').evaluateAll((nodes) => nodes.map((node) => globalThis.getComputedStyle(node).fontSize));
    assert.equal(new Set(sizes).size, 1);
    assert.equal(await page.getByRole('combobox').count(), 0);
    await page.getByRole('button', { name: 'تعديل المقدار: المجادلة 9–11' }).first().click();
    await page.getByRole('combobox', { name: 'آية النهاية' }).waitFor();
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/recitation-amounts-${width}.png` });
    await page.close();
  }
} finally { await browser.close(); }
