import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3023';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = resolve('outputs/statistics-plans-20261022');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const createContext = async options => {
  const context = await browser.newContext({ ...options, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/health')) return route.fulfill({ json: { ok: true },
      headers: { 'Access-Control-Allow-Origin': new URL(base).origin, 'Access-Control-Allow-Credentials': 'true' } });
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  return context;
};
const evidence = [];
try {
  for (const width of [320, 390, 1440]) {
    const context = await createContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/fixtures/statistics-corrections.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const card = page.getByRole('button', { name: 'جلسة المسار: 7%', exact: true });
    await card.waitFor();
    assert.ok(await page.getByText(/بالتقويم الهجري/).count());
    assert.ok(await page.locator('body').evaluate(node => node.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: join(output, `statistics-${width}.png`), fullPage: true });
    await card.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('إتقان المقاطع المختبرة', { exact: true }).waitFor();
    await dialog.getByText('اكتمال رصد المقاطع', { exact: true }).waitFor();
    assert.ok((await dialog.innerText()).includes('100%'));
    assert.ok((await dialog.innerText()).includes('5%'));
    await dialog.getByRole('combobox', { name: 'الحلقة' }).click();
    await page.getByRole('option', { name: 'العصر', exact: true }).click();
    await dialog.getByText('لم يُختبر', { exact: true }).waitFor();
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
    await dialog.screenshot({ path: join(output, `track-details-${width}.png`) });
    await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await card.waitFor();
    await page.evaluate(() => { globalThis.statisticsFixture.fail = true; globalThis.dispatchEvent(new globalThis.Event('focus')); });
    await page.getByRole('status').filter({ hasText: 'نسخة محفوظة' }).waitFor();
    assert.ok((await page.getByRole('status').filter({ hasText: 'نسخة محفوظة' }).innerText()).includes('آخر تحديث'));
    assert.deepEqual(errors, []);
    evidence.push({ width, overall: '7%', accuracy: '100%', coverage: '5%', detailsFilterPreservesCard: true, savedReportWarning: true, errors });
    await context.close();
  }
  const context = await createContext({ viewport: { width: 390, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${base}/tests/fixtures/statistics-corrections.html?scenario=empty`);
  await page.getByRole('button', { name: 'جلسة المسار: —', exact: true }).waitFor();
  await page.getByRole('button', { name: 'الجلسة الأسبوعية: —', exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'no-due-sessions-390.png'), fullPage: true });
  await context.close();
  const raceContext = await createContext({ viewport: { width: 390, height: 1000 }, serviceWorkers: 'block' });
  const racePage = await raceContext.newPage();
  await racePage.goto(`${base}/tests/fixtures/statistics-corrections.html?scenario=race`);
  await racePage.waitForFunction(() => globalThis.statisticsFixture?.pointCalls === 1);
  await racePage.getByRole('combobox', { name: 'الفترة', exact: true }).click();
  await racePage.getByRole('option', { name: 'هذا اليوم', exact: true }).click();
  const points = racePage.getByRole('button', { name: 'الإضافة والخصم: 2', exact: true });
  await points.waitFor();
  await racePage.evaluate(() => globalThis.statisticsFixture.releaseOld());
  await racePage.waitForFunction(() => globalThis.statisticsFixture.oldFinished);
  await points.click();
  await racePage.getByRole('dialog').getByText('بيانات الفترة الحالية 1', { exact: true }).waitFor();
  assert.equal(await racePage.getByText('بيانات الفترة السابقة', { exact: true }).count(), 0);
  evidence.push({ emptyPeriod: '—', stalePointResponseDiscarded: true });
  await raceContext.close();
  await writeFile(join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('Statistics browser passed at 320/390/1440: overall/accuracy/coverage, no-data state, stable scope, saved-data timestamp, stale response protection, RTL and no overflow.');
} finally { await browser.close(); }
