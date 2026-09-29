import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.fulfill({ json: [] }));
    const url = 'http://127.0.0.1:3011/tests/fixtures/account-ui-revision.html';
    await page.goto(url);
    await page.getByRole('button', { name: 'شراء', exact: true }).first().waitFor();
    const heights = await page.locator('h3').evaluateAll(nodes => nodes.map(node => node.parentElement.parentElement.getBoundingClientRect().height));
    assert.equal(heights.length, 4);
    assert.ok(Math.max(...heights) - Math.min(...heights) < 1, JSON.stringify(heights));
    assert.equal(await page.locator('.student-home-level').innerText(), '');
    assert.equal(await page.locator('.student-home-level svg').count(), 1);
    const bar = await page.locator('.student-home-header-progress').boundingBox();
    assert.equal(bar.width, 130);
    assert.equal(bar.height, 10);
    await page.getByRole('button', { name: 'قائمة حساب الطالب' }).click();
    const accountWidth = (await page.locator('.student-home-account-menu').boundingBox()).width;
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
    const notificationsWidth = (await page.locator('.student-home-notifications').boundingBox()).width;
    assert.ok(Math.abs(accountWidth - notificationsWidth) < 1);
    assert.ok(notificationsWidth <= 180);
    await page.screenshot({ path: `outputs/account-ui-revision-${width}.png` });
    await page.goto(`${url}?login`);
    assert.equal(await page.getByRole('link').count(), 0);
    const input = page.getByLabel('رقم الحساب', { exact: true });
    await input.fill('863');
    const button = page.getByRole('button', { name: 'دخول' });
    assert.match(await button.evaluate(node => globalThis.getComputedStyle(node).backgroundImage), /linear-gradient\(105deg/);
    await button.click();
    await page.locator('[data-loading-indicator]').waitFor();
    assert.equal(await page.locator('.loading-logo:visible').count(), 1);
    assert.equal((await page.locator('main:visible, [data-loading-indicator]:visible').first().innerText()).trim(), '');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.info('Equal product cards, compact notifications and unified login loading passed at three sizes.');
} finally { await browser.close(); }
