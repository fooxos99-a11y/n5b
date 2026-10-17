import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { readLocalCallEnvironment } from '../scripts/call-archive-local-config.mjs';

const config = await readLocalCallEnvironment();
assert.equal(config.CALL_ARCHIVE_ENABLED, 'false', 'Preparation UI checks must not record or analyze audio.');
assert.ok(config.CALL_ARCHIVE_DEMO_PASSWORD);
await mkdir('outputs', { recursive: true });
const base = 'http://127.0.0.1:3038';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) for (const [number, role] of [['990002', 'reciter'], ['990003', 'student']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const external = [], errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) { external.push(url.origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/login`);
    await page.getByLabel('رقم الدخول', { exact: true }).fill(number);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(config.CALL_ARCHIVE_DEMO_PASSWORD);
    await page.getByRole('button', { name: 'تسجيل دخول', exact: true }).click();
    if (role === 'reciter') await page.waitForURL('**/portal/calls');
    else { await page.waitForURL(base + '/'); await page.goto(`${base}/#student/calls`); }
    await page.getByRole('tab', { name: 'الغرف المفتوحة', exact: true }).waitFor();
    await page.getByText('المكالمات غير متاحة حاليًا.', { exact: true }).waitFor();
    await page.locator('#startup-splash').waitFor({ state: 'hidden' });
    await page.locator('[data-loading-indicator="screen"]').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('audio').count(), 0, 'No microphone or call is opened during preparation');
    assert.deepEqual(external, [], 'The local UI must not access external HTTP endpoints');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/real-local-preparation-${role}-${width}.png`, fullPage: true });
    await context.close();
  }
  console.log('Real local UI preparation passed at 390/1440: actual student/reciter password login, actual API sessions and calls scope, honest unconfigured media state, no external HTTP requests, no microphone or recording. No routes/providers were mocked.');
} finally { await browser.close(); }
