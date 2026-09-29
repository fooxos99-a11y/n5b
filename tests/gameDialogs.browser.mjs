import assert from 'node:assert/strict';
import console from 'node:console';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import MushafIndex from './src/components/portal/StudentMushafIndexDialog.jsx';
    import FullScreenPage from './src/components/ui/full-screen-page.jsx';
    function App() {
      const [view, setView] = useState('');
      return <><button id="open" onClick={() => setView(location.hash.slice(1))}>فتح</button>
        <FullScreenPage open={view === 'full-page'} onClose={() => setView('')} label="صفحة الاختبار">
          <button id="prevent-close" onKeyDown={(event) => { if (event.key === 'Escape') event.preventDefault(); }}>منع الإغلاق</button>
          <button id="allow-close">إغلاق بلوحة المفاتيح</button>
        </FullScreenPage>
        {view === 'mushaf' && <MushafIndex open onOpenChange={(open) => { if (!open) setView(''); }} index={{ chapters: [{ number: 1, name: 'الفاتحة', startPage: 1 }], pageCount: 604, juzs: [] }} currentPage={1} onSelectPage={() => {}} />}
      </>;
    }
    createRoot(document.getElementById('root')).render(<App />);`, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, outdir: path.join(root, 'tmp/dialog-test'),
  alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' },
});
const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
const utilities = await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(root, 'src/components/portal/StudentMushafIndexDialog.jsx'), path.join(root, 'src/components/ui/*.{js,jsx}')] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
const css = utilities.css + (bundle.outputFiles.find((file) => file.path.endsWith('.css'))?.text || '');
const server = createServer((req, res) => {
  const _resolveServer = () => {
    if (req.url === '/app.js') {
      return 'application/javascript';
    }
    if (req.url === '/app.css') {
      return 'text/css';
    }
    return 'text/html';
  };
  res.setHeader('Content-Type', _resolveServer());
  const _resolveServer2 = () => {
    if (req.url === '/app.js') {
      return js;
    }
    if (req.url === '/app.css') {
      return css;
    }
    return `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0}:root{--font-ui:Arial;--card:0 0% 100%;--primary:260 70% 50%}.sr-only{width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  };
  res.end(_resolveServer2());
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width <= 768 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const view of ['mushaf']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/#${view}`);
      await page.locator('#open').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(300);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${view} fits ${width}px`);
      assert.ok(bounds.height <= 869, `${view} scrolls within viewport`);
      assert.equal(await dialog.getAttribute('dir'), 'rtl');
      for (let press = 0; press < 12; press += 1) {
        await page.keyboard.press('Tab');
        assert.ok(await dialog.evaluate((element) => element.contains(globalThis.document.activeElement)), 'focus remains in dialog');
      }
      await dialog.click({ position: { x: 10, y: 10 } });
      assert.equal(await dialog.count(), 1, 'inside clicks do not dismiss');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => globalThis.document.activeElement?.id === 'open');
      assert.equal(await page.locator('#open').evaluate((element) => globalThis.document.activeElement === element), true);
      await page.locator('#open').click();
      await dialog.waitFor();
      await page.waitForTimeout(300);
      if (width <= 768) await page.touchscreen.tap(2, 2);
      else await page.mouse.click(2, 2);
      await dialog.waitFor({ state: 'detached' });
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/#full-page`);
    await page.locator('#open').click();
    const fullPage = page.getByRole('region', { name: 'صفحة الاختبار' });
    await fullPage.waitFor();
    assert.equal(await page.locator('#root').evaluate((element) => element.inert), true);
    await page.locator('#prevent-close').focus();
    await page.keyboard.press('Escape');
    assert.equal(await fullPage.count(), 1, 'child can prevent Escape dismissal');
    await page.locator('#allow-close').focus();
    await page.keyboard.press('Escape');
    await fullPage.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#root').evaluate((element) => element.inert), false);
    assert.equal(await page.locator('#open').evaluate((element) => globalThis.document.activeElement === element), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: Mushaf index dialog and full-screen page at 360/768/1440px; RTL, focus, Escape cancellation, and pointer dismissal');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
