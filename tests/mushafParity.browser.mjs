import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const folder = 'outputs/nukhba-refinement-20261022';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
let reference;
try {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.addInitScript(value => {
        globalThis.localStorage.setItem('nukhab_student_mushaf_reader-staff_last_page', '64');
        globalThis.localStorage.setItem('nukhab_student_mushaf_theme', value);
      }, theme);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3057/tests/fixtures/mushaf-reader.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.locator('.mushaf-page-turn').getByLabel('رقم الصفحة 64', { exact: true }).waitFor();
      await page.evaluate(() => globalThis.document.fonts.ready);
      const face = page.locator('.mushaf-page-turn .mushaf-page');
      const bounds = await face.boundingBox();
      assert.ok(Math.abs(bounds.width / bounds.height - 0.6) < 0.001);
      assert.ok(bounds.x >= -0.5 && bounds.y >= -0.5 && bounds.x + bounds.width <= viewport.width + 0.5 && bounds.y + bounds.height <= viewport.height + 0.5);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      const words = await face.locator('[data-location]').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { location: element.dataset.location, line: element.dataset.mushafLine, x: box.x, y: box.y, width: box.width, height: box.height,
          font: globalThis.getComputedStyle(element).fontFamily };
      }));
      const normalized = words.map(word => ({ ...word, x: (word.x - bounds.x) / bounds.width, y: (word.y - bounds.y) / bounds.height,
        width: word.width / bounds.width, height: word.height / bounds.height }));
      let maximumDifference = 0;
      if (!reference) reference = normalized;
      assert.equal(words.length, reference.length);
      normalized.forEach((word, index) => {
        assert.equal(word.location, reference[index].location);
        assert.equal(word.line, reference[index].line);
        assert.equal(word.font, reference[index].font);
        for (const dimension of ['x', 'y', 'width', 'height']) maximumDifference = Math.max(maximumDifference, Math.abs(word[dimension] - reference[index][dimension]));
      });
      assert.ok(maximumDifference < 0.008, `Relative Quran geometry differs: ${maximumDifference}`);
      await page.screenshot({ path: `${folder}/mushaf-${viewport.width}-${theme}.png` });
      assert.deepEqual(errors, []);
      evidence.push({ viewport, theme, page: 64, words: words.length, aspectRatio: bounds.width / bounds.height, font: words[0].font, maximumRelativeDifference: maximumDifference, overflow: false });
      await context.close();
    }
  }
  await writeFile(`${folder}/mushaf-parity.json`, JSON.stringify(evidence, null, 2));
  globalThis.console.log(`PASS ${evidence.length} real packaged Quran mobile/tablet/desktop light/dark comparisons: identical words, lines, fonts and page proportions.`);
} finally { await browser.close(); }
