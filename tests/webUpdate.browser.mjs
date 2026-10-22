import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright';

const index = await readFile('dist/nukhab/index.html', 'utf8');
const base = /src="([^"\s]*)assets\//.exec(index)?.[1];
assert.ok(base?.startsWith('/'));
const server = await preview({ mode: 'nukhab', build: { outDir: 'dist/nukhab' },
  preview: { host: '127.0.0.1', port: 3024, strictPort: true } });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    let manifestRequests = 0, nativeRequests = 0;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/app-version.json')) {
        manifestRequests++;
        return route.fulfill({ json: { buildId: 'a6ef3697-7468-49ab-b35d-e26b9a5af711' } });
      }
      if (url.pathname.includes('/native-update')) nativeRequests++;
      if (url.pathname.includes('/api/')) return route.fulfill({ json: url.pathname.endsWith('/health') ? { ok: true } : {},
        headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3024', 'Access-Control-Allow-Credentials': 'true' } });
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3024${base}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => globalThis.document.getElementById('app-root')?.dataset.mounted === 'true');
    await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('focus')));
    await page.waitForLoadState('networkidle');
    assert.equal(manifestRequests, 0, 'the production website never starts mandatory web update polling');
    assert.equal(nativeRequests, 0, 'native update policy is not requested by the website');
    assert.equal(await page.getByText('يلزم تحديث التطبيق للمتابعة', { exact: true }).count(), 0);
    await context.close();
  }
  console.log('Production web update browser passed at 390/1440: mounted real build, focus/resume, different mocked manifest, no update polling, native policy or mandatory dialog.');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
