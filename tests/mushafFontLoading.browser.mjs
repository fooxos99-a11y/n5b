import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const evidence = [];
for (const engine of [webkit, chromium]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion });
      let releaseFont, requested = false;
      const fontGate = new Promise(resolve => { releaseFont = resolve; });
      try {
        await context.route(/\/quran\/hafs\/fonts\/(?:[^/?]+\/)*p66\.woff2(?:\?.*)?$/, async route => {
          requested = true; await fontGate; await route.continue();
        });
        await context.addInitScript(() => globalThis.localStorage.setItem('nukhab_student_mushaf_reader-staff_last_page', '64'));
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:3057/tests/fixtures/mushaf-reader.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
        const face = page.locator('.mushaf-page-turn');
        const wait = async number => {
          await face.getByLabel(`رقم الصفحة ${number}`, { exact: true }).waitFor();
          await page.evaluate(() => globalThis.document.fonts.ready);
          await face.evaluate(async element => {
            await Promise.all(element.getAnimations().map(animation => animation.finished));
            await new Promise(resolve => globalThis.requestAnimationFrame(resolve));
          });
        };
        const geometry = () => face.locator('[data-location]').evaluateAll(elements => elements.map(element => {
          const box = element.getBoundingClientRect();
          return { location: element.dataset.location, x: box.x, y: box.y, width: box.width, height: box.height };
        }));
        await wait(64); await page.keyboard.press('ArrowRight'); await wait(65);
        const before = await geometry(), turnClass = await face.getAttribute('class');
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
        assert.ok(requested, 'The next font is genuinely held');
        assert.ok(await face.getByLabel('رقم الصفحة 65', { exact: true }).isVisible());
        assert.equal(await face.getAttribute('class'), turnClass, 'Pending font preserves the current turn state');
        const after = await geometry(); assert.equal(after.length, before.length);
        after.forEach((word, index) => {
          assert.equal(word.location, before[index].location);
          for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(word[dimension] - before[index][dimension]) < 0.15,
            `${engine.name()} pending font shifted ${word.location}/${dimension}`);
        });
        releaseFont(); await wait(66);
        evidence.push({ engine: engine.name(), reducedMotion, pendingPage: 66, retainedPage: 65, geometryStable: true, successorLoaded: true });
      } finally { releaseFont(); await context.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/nukhba-refinement-20261022/font-loading-evidence.json', JSON.stringify(evidence, null, 2));
globalThis.console.log('PASS four Chromium/WebKit animated/reduced-motion delayed-font scenarios: current page, turn state and word geometry stay stable until the next font is ready.');
