import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';

const results = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ timezoneId: 'America/New_York' });
    await context.route('**/api/**', (route) => route.fulfill({ json: { students: [], tasks: [] } }));
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-09-07T02:59:59+03:00') });
    await page.clock.setFixedTime(new Date('2026-09-07T02:59:59+03:00'));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/recitation-policy.html');
    await page.waitForFunction(() => Boolean(globalThis.recitationFixture));
    await page.evaluate(async () => {
      const { store } = globalThis.recitationFixture;
      const actor = 'default:supervisor:990';
      await store.cacheSnapshot(actor, { date: '2026-09-06', students: [], tasks: [] });
      await store.cacheSnapshot(`${actor}:bootstrap`, { serverTime: new Date().toISOString(), cacheDays: 14,
        timezone: 'Asia/Riyadh', students: [], tasks: [] });
      await store.setMeta(`time_anchor:${actor}`, { serverEpochMs: Date.now(), deviceEpochMs: Date.now() });
    });
    const before = await page.evaluate(async () => (await globalThis.recitationFixture.getCachedTeacherEvaluation(990)).date);
    assert.equal(before, '2026-09-06');
    await page.clock.setFixedTime(new Date('2026-09-07T03:00:00+03:00'));
    const after = await page.evaluate(async () => (await globalThis.recitationFixture.getCachedTeacherEvaluation(990)).date);
    assert.equal(after, '2026-09-07');
    results.push({ engine: name, before, after, deviceTimezone: 'America/New_York', passed: true });
    await context.close();
  } finally { await browser.close(); }
}
await writeFile('outputs/business-day-browser-proof.json', JSON.stringify(results, null, 2));
