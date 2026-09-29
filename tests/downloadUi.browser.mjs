import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/api/site-config*', route => route.fulfill({ json: { key: 'nukhab', name: 'نخب', logo: 'branding/rawasi/alhabib-map-color-640.webp', squareLogo: 'branding/rawasi/icon-512.png', appStoreUrl: 'https://apps.apple.com/app/id6798071538' } }));
    await page.goto('http://localhost:3000/download');
    await page.waitForFunction(() => {
      const logo = globalThis.document.querySelector('main img');
      return logo?.src.includes('/nukhab/icon-512.png') && logo.complete && logo.naturalWidth > 0;
    });
    await page.evaluate(() => globalThis.document.fonts.ready);
    assert.deepEqual(await page.locator('bdi').allTextContents(), ['Android', 'App Store']);
    assert.ok(await page.locator('bdi').evaluateAll(els => els.every(el => {
      const text = el.getBoundingClientRect(), button = el.closest('a').getBoundingClientRect();
      return text.left >= button.left && text.right <= button.right;
    })));
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
    await page.screenshot({ path: `outputs/download-alhabib-${width}.png` });
    await page.close();
  }
} finally { await browser.close(); }
