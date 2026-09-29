import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    let contactRequests = 0;
    await page.route('**/api/registration/public**', route => route.fulfill({ json: { enabled: width !== 360, juzRanges: [] } }));
    await page.route('**/api/contact-messages', route => {
      contactRequests++;
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto(`${process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3107'}/tests/fixtures/registration-contact.html?registrationNumber=1234`);
    await page.locator('main').waitFor();
    assert.equal(await page.getByRole('button', { name: 'تواصل معنا', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('موضوع الرسالة', { exact: true }).count(), 0);
    assert.equal(contactRequests, 0);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.close();
  }
} finally { await browser.close(); }
