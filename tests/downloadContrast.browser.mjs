import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
 for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript((theme) => globalThis.localStorage.setItem('nukhab_theme_public', theme), theme);
  await page.route('**/api/site-config', (route) => route.fulfill({ json: {} }));
  await page.goto('http://127.0.0.1:3000/download');
  const link = page.getByRole('link', { name: 'تحميل نسخة App Store' });
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), 'https://apps.apple.com/sa/app/id6798071538');
  await page.screenshot({ path: `outputs/download-fixed-${theme}.png`, animations: 'disabled' });
  const style = await link.evaluate((el) => ({ color: globalThis.getComputedStyle(el).color, background: globalThis.getComputedStyle(el).backgroundColor }));
  assert.equal(style.background, 'rgb(255, 255, 255)');
  assert.equal(style.color, 'rgb(6, 59, 80)');
  assert.ok((await page.locator('main img').getAttribute('src')).includes('alhabib-map-color'));
  await context.close();
 }
 process.stdout.write('App Store direct link and button contrast passed in both themes\n');
} finally { await browser.close(); }
