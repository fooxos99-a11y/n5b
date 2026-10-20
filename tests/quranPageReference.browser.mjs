import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const out = 'outputs/quran-page-reference-20261020';
await mkdir(out, { recursive: true });
process.stdout.write('Starting local Quran amount preview.\n');
const server = await createServer({ configFile: false, plugins: [react()],
  resolve: { alias: { '@': path.resolve('src') } },
  optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'lucide-react', '@radix-ui/react-slot'] },
  cacheDir: 'node_modules/.vite-quran-page-reference',
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
process.stdout.write('Local Quran amount preview ready; opening Chromium.\n');
const browser = await chromium.launch();
try {
  for (const width of [390,1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/quran-face-reference.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    process.stdout.write(`Checking Quran amount display at ${width} pixels.\n`);
    await page.getByTestId('student-2').waitFor({ timeout: 120000 });
    assert.doesNotMatch(await page.getByTestId('student-0').innerText(), /بقية وجه/);
    assert.match(await page.getByTestId('student-1').innerText(), /بقية وجه/);
    assert.match(await page.getByTestId('teacher-1').innerText(), /بقية وجه/);
    assert.match(await page.getByTestId('teacher-2').innerText(), /بقية وجه/);
    await page.screenshot({ path: `${out}/amounts-${width}.png`, fullPage: true });
    process.stdout.write(`${JSON.stringify(await page.getByTestId('teacher-1').locator('.recitation-amount-text').evaluate(node => ({ text: node.textContent, height: node.clientHeight, scroll: node.scrollHeight, width: node.clientWidth })))}\n`);
    assert.ok(await page.getByTestId('teacher-1').locator('.recitation-amount-text').evaluate(node => node.scrollHeight <= node.clientHeight + 1), 'Both ayah endpoints must remain visible');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write('Quran remainder amounts: student and teacher previews passed at 390 and 1440 pixels.\n');
} finally { await browser.close(); await server.close(); }
