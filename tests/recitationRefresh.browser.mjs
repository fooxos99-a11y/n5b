import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium, webkit } from 'playwright';
const origin = process.env.RECITATION_TEST_ORIGIN || 'http://127.0.0.1:3000';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${origin}/tests/fixtures/recitation-refresh.html`);
      await page.waitForFunction(() => globalThis.refreshFixture?.requests.length === 1 && globalThis.refreshFixture.cacheReads > 0);
      // Online startup waits for current completion state, without flashing cached actions.
      assert.equal(await page.getByRole('button', { name: 'مراجعة' }).count(), 0);
      assert.equal(await page.evaluate(() => globalThis.refreshFixture.evaluation.isLoading), true);
      await page.evaluate(() => {
        const f = globalThis.refreshFixture;
        f.requests[0].resolve({ date: '2026-09-07', tasks: [{ id: 1, taskType: 'review' }], students: [] });
      });
      await page.waitForFunction(() => !globalThis.refreshFixture.evaluation.isLoading);
      // Start a refresh before saving, then let that old response arrive afterwards.
      await page.evaluate(() => { void globalThis.refreshFixture.evaluation.load(); });
      await page.waitForFunction(() => globalThis.refreshFixture.requests.length === 2);
      await page.evaluate(() => { globalThis.refreshFixture.finish(); });
      await page.waitForFunction(() => globalThis.refreshFixture.evaluation.data.tasks.length === 0);
      await page.evaluate(() => { globalThis.refreshFixture.renders.length = 0; });
      await page.evaluate(async () => {
        const f = globalThis.refreshFixture;
        const before = f.cacheReads;
        const fresh = f.evaluation.load();
        await Promise.resolve();
        // The fresh request must not deduplicate against the invalidated old request.
        if (f.requests.length !== 3) throw new Error('Fresh load reused a stale request');
        f.requests[1].resolve({ date: '2026-09-07', tasks: [{ id: 1, taskType: 'review' }], students: [] });
        while (f.cacheReads === before) await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
        f.requests[2].resolve({ date: '2026-09-07', tasks: [], students: [] });
        await fresh;
      });
      assert.equal(await page.getByRole('button', { name: 'مراجعة' }).count(), 0);
      assert.equal(await page.evaluate(() => globalThis.refreshFixture.renders.includes(1)), false);
      // An authoritative retryable task may return; never hide a real server rejection.
      await page.evaluate(async () => {
        const f = globalThis.refreshFixture;
        const request = f.evaluation.load();
        await Promise.resolve();
        f.requests.at(-1).resolve({ date: '2026-09-07', tasks: [{ id: 1, taskType: 'review' }], students: [] });
        await request;
      });
      await page.getByRole('button', { name: 'مراجعة' }).waitFor();
      await page.evaluate(() => { globalThis.refreshFixture.finish(); });
      await page.waitForFunction(() => globalThis.refreshFixture.evaluation.data.tasks.length === 0);
      // A failed background refresh must retain the current local state too.
      await page.evaluate(async () => {
        const f = globalThis.refreshFixture;
        const request = f.evaluation.load();
        await Promise.resolve();
        f.requests.at(-1).reject(new Error('تعذر الاتصال'));
        await request;
      });
      await page.waitForFunction(() => globalThis.refreshFixture.evaluation.loadError === 'تعذر الاتصال');
      assert.equal(await page.getByRole('button', { name: 'مراجعة' }).count(), 0);
      assert.equal(await page.getByRole('alert').textContent(), 'تعذر الاتصال');
      // Slow device writes must not keep a network-loaded session behind a spinner.
      await page.goto(`${origin}/tests/fixtures/recitation-refresh.html?slowStorage=1`);
      await page.waitForFunction(() => globalThis.refreshFixture?.requests.length === 1);
      const started = Date.now();
      await page.evaluate(() => globalThis.refreshFixture.requests[0].resolve({ date: '2026-09-07', tasks: [{ id: 2, taskType: 'review' }], students: [] }));
      await page.waitForFunction(() => globalThis.refreshFixture.evaluation.data?.tasks[0]?.id === 2 && !globalThis.refreshFixture.evaluation.isLoading);
      assert.equal(await page.evaluate(() => globalThis.refreshFixture.writing), true);
      globalThis.console.log(`${engine.name()}: session visible with snapshot write still blocked (${Date.now() - started} ms after response).`);
      await page.evaluate(() => globalThis.refreshFixture.releaseWrite());
      await page.close();
    }
    const offline = await browser.newPage();
    await offline.addInitScript(() => Object.defineProperty(globalThis.navigator, 'onLine', { get: () => false }));
    await offline.goto(`${origin}/tests/fixtures/recitation-refresh.html`);
    await offline.getByRole('button', { name: 'مراجعة' }).waitFor();
    assert.equal(await offline.evaluate(() => globalThis.refreshFixture.requests.length), 0);
    await offline.close();
  } finally { await browser.close(); }
}
globalThis.console.log('Recitation completion stays hidden across stale cache, in-flight responses and refresh failure in Chromium/WebKit.');
