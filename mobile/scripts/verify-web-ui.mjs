import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the repository's installed browser-test runner; mobile dependencies stay separate.
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(appRoot, 'dist', 'web');
const evidenceRoot = path.join(appRoot, 'evidence');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${webRoot}${path.sep}`)) { response.writeHead(403).end(); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const report = { date: new Date().toISOString(), environment: 'Chromium browser preview only', viewports: [] };
try {
  await mkdir(evidenceRoot, { recursive: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('heading', { name: 'تجربة نخب' }).waitFor();
    const filename = `web-${width}.png`;
    await page.screenshot({ path: path.join(evidenceRoot, filename), fullPage: true });
    await page.getByRole('button', { name: 'ٱلرَّحۡمَٰنِ', exact: true }).first().click();
    await page.getByRole('button', { name: 'رَبِّ', exact: true }).click();
    const selected = await page.locator('button[aria-label$="، محددة"]').count();
    assert.equal(selected, 5);
    await page.getByRole('button', { name: 'مسح التحديد', exact: true }).click();
    assert.equal(await page.locator('button[aria-label$="، محددة"]').count(), 0);
    await page.getByRole('button', { name: 'الصفحة التالية', exact: true }).click();
    await page.getByText('صفحة 2', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'الصفحة التالية', exact: true }).click();
    await page.getByText('صفحة 604', { exact: true }).waitFor();
    await page.getByText('سورة الإخلاص', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidenceRoot, `web-page604-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'الصفحة السابقة', exact: true }).click();
    await page.getByRole('button', { name: 'الصفحة السابقة', exact: true }).click();
    await page.getByText('صفحة 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'حفظ التجربة', exact: true }).click();
    await page.getByText('فحص التخزين المشفر يحتاج نسخة تطوير على Android أو iPhone. المرحلة: native-platform؛ النوع: Error؛ الرمز: native-required.', { exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `Horizontal overflow at ${width}`);
    assert.deepEqual(failures, []);
    await page.screenshot({ path: path.join(evidenceRoot, `web-storage-${width}.png`), fullPage: true });
    report.viewports.push({ width, result: 'passed', selectionAcrossLines: selected,
      samplePages: [1, 2, 604], storage: 'correctly unavailable on web', screenshot: filename });
    await context.close();
  }
  await writeFile(path.join(evidenceRoot, 'web-ui.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
