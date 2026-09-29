import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, hasTouch: true });
    await page.goto((process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107') + '/tests/fixtures/scoped-ui.html?section=levels');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const group = page.getByRole('region', { name: 'التأهيل', exact: true });
    assert.equal(await group.getByRole('button').count(), 1);
    const ring = await group.locator('svg').boundingBox();
    assert.ok(ring.width >= 120);
    assert.equal(await group.locator('svg g').count(), 2);
    const colors = await group.locator('svg g > circle:first-child').evaluateAll(elements => elements.map(element => element.getAttribute('stroke')));
    assert.equal(new Set(colors).size, 2);
    await page.mouse.move(ring.x + ring.width - 12, ring.y + ring.height / 2);
    await group.getByRole('heading', { name: 'تأهيل 1', exact: true }).waitFor();
    assert.equal(await group.locator('strong').innerText(), '1');
    await page.touchscreen.tap(ring.x + 12, ring.y + ring.height / 2);
    await page.getByText('طالب تأهيل 2', { exact: true }).waitFor();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: `${process.env.TEMP}/nukhab-level-rings-${width}.png`, animations: 'disabled' });
    await page.close();
    globalThis.console.log(`Level rings: hover, touch, distinct colors and layout passed at ${width}px.`);
  }
} finally { await browser.close(); }
