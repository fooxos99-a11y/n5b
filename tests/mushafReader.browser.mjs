import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3217';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const previewDirectory = 'outputs/mushaf-preview';
await mkdir(previewDirectory, { recursive: true });

const currentPage = (page, number) => page.locator('.mushaf-page-turn').getByLabel(`رقم الصفحة ${number}`, { exact: true });
const face = (page) => page.locator('.mushaf-page-turn .mushaf-page');
const openIndex = (page) => page.getByRole('button', { name: 'فتح فهرس المصحف', exact: true });

const waitForFace = async (page, number) => {
  await currentPage(page, number).waitFor();
  await page.evaluate(() => globalThis.document.fonts.ready);
  // Wait for the page-turn animation before comparing physical word positions.
  await page.waitForTimeout(250);
};

const tapMargin = async (page) => {
  const bounds = await face(page).boundingBox();
  assert.ok(bounds);
  await face(page).click({ position: { x: 3, y: bounds.height / 2 } });
};

const showTools = async (page) => {
  if (!await openIndex(page).isVisible()) await tapMargin(page);
  await openIndex(page).waitFor({ state: 'visible' });
};

const hideTools = async (page) => {
  if (await openIndex(page).isVisible()) await tapMargin(page);
  await openIndex(page).waitFor({ state: 'hidden' });
};

const wordPositions = (page) => face(page).locator('[data-location]').evaluateAll((words) => words.map((word) => {
  const bounds = word.getBoundingClientRect();
  return { location: word.dataset.location, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}));

const assertSamePositions = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((word, index) => {
    assert.equal(word.location, expected[index].location, message);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(word[key] - expected[index][key]) < 0.15, `${message}: ${word.location}/${key}`);
    }
  });
};

const selectPage = async (page, number) => {
  await showTools(page);
  await openIndex(page).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'الصفحات', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'البحث في فهرس المصحف' }).fill(String(number));
  await dialog.getByRole('button', { name: String(number), exact: true }).click();
  await waitForFace(page, number);
};

const assertPageFits = async (page) => {
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
  const bounds = await face(page).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds.x >= -0.5 && bounds.y >= -0.5);
  assert.ok(bounds.x + bounds.width <= viewport.width + 0.5);
  assert.ok(bounds.y + bounds.height <= viewport.height + 0.5);
  const wordBounds = await wordPositions(page);
  for (const word of wordBounds) {
    assert.ok(word.x >= bounds.x - 0.5 && word.x + word.width <= bounds.x + bounds.width + 0.5, `word ${word.location} must remain inside page`);
  }
  const finishBounds = await page.getByRole('button', { name: 'إنهاء', exact: true }).boundingBox();
  assert.ok(finishBounds.height >= 44 && finishBounds.width >= 44, 'finish remains touch accessible');
  assert.ok(finishBounds.y >= Math.max(...wordBounds.map((word) => word.y + word.height)), 'finish must not cover Quran text');
};

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 588, height: 1280 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        if (!globalThis.localStorage.getItem('nukhab_student_mushaf_theme')) globalThis.localStorage.setItem('nukhab_student_mushaf_theme', 'dark');
      });
      await page.goto(`${base}/tests/fixtures/mushaf-reader.html`);
      await waitForFace(page, 1);
      assert.equal(await openIndex(page).isVisible(), false, 'reader opens in quiet reading mode');
      assert.equal(await page.locator('.mushaf-reader-navigation').count(), 0);
      await assertPageFits(page);

      const quietBounds = await wordPositions(page);
      await showTools(page);
      assertSamePositions(await wordPositions(page), quietBounds, 'showing tools must not move Quran text');
      assert.ok((await openIndex(page).boundingBox()).height >= 44);
      await hideTools(page);
      assertSamePositions(await wordPositions(page), quietBounds, 'hiding tools must not move Quran text');
      await page.getByRole('button', { name: 'إظهار أدوات المصحف', exact: true }).focus();
      await page.keyboard.press('Enter');
      await openIndex(page).waitFor({ state: 'visible' });
      await hideTools(page);

      await page.keyboard.press('ArrowLeft');
      assert.ok(await currentPage(page, 1).count());
      await page.keyboard.press('ArrowRight');
      await waitForFace(page, 2);
      await assertPageFits(page);
      await page.keyboard.press('ArrowRight');
      await waitForFace(page, 3);
      const surface = page.locator('[data-mushaf-drag-surface]');
      const surfaceBounds = await surface.boundingBox();
      await page.mouse.move(surfaceBounds.x + surfaceBounds.width * 0.5, surfaceBounds.y + surfaceBounds.height * 0.4);
      await page.mouse.down();
      await page.mouse.move(surfaceBounds.x + surfaceBounds.width * 0.5 + 80, surfaceBounds.y + surfaceBounds.height * 0.4, { steps: 6 });
      await page.waitForFunction(() => {
        const surface = globalThis.document.querySelector('[data-mushaf-drag-surface]');
        return surface && globalThis.getComputedStyle(surface).transform !== 'none';
      });
      assert.notEqual(await surface.evaluate((element) => globalThis.getComputedStyle(element).transform), 'none');
      await page.mouse.up();
      await waitForFace(page, 4);
      assert.equal(await openIndex(page).isVisible(), false, 'swipe must not reveal tools');

      for (let escapeTrial = 0; escapeTrial < 3; escapeTrial += 1) {
      await showTools(page);
      await openIndex(page).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('data-reader-theme'), 'dark');
      await page.keyboard.press('ArrowRight');
      assert.ok(await currentPage(page, 4).count(), 'open index captures navigation keys');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      }
      await page.evaluate(() => globalThis.mushafReaderFixture.preloadCompleteOfflineMushaf());
      await page.waitForLoadState('networkidle');
      await page.reload();
      await waitForFace(page, 4);
      assert.equal(await openIndex(page).isVisible(), false, 'reload resets tool visibility');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.keyboard.press('ArrowRight');
      await waitForFace(page, 5);

      await selectPage(page, 64);
      await hideTools(page);
      await assertPageFits(page);
      assert.equal(await face(page).locator('[data-mushaf-line="3"][data-mushaf-word-index]').last().getAttribute('data-location'), '3:110:14', 'reference page 64 line three ends at آمن');
      assert.equal(await face(page).locator('[data-mushaf-line="4"][data-mushaf-word-index]').first().getAttribute('data-location'), '3:110:15', 'reference page 64 line four starts at أهل');
      if (engine === chromium && [390, 588].includes(viewport.width)) {
        const target = viewport.width === 588 ? 'reference-size' : 'mobile';
        await page.screenshot({ path: join(previewDirectory, `dark-page64-${target}.png`) });
        await showTools(page);
        await page.screenshot({ path: join(previewDirectory, `dark-page64-tools-${target}.png`) });
      }
      await showTools(page);
      const darkPositions = await wordPositions(page);
      await page.getByRole('button', { name: 'تفعيل المصحف الأبيض', exact: true }).click();
      assertSamePositions(await wordPositions(page), darkPositions, 'changing the theme must preserve text geometry');
      assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('nukhab_student_mushaf_theme')), 'light');

      await selectPage(page, 66);
      await hideTools(page);
      await assertPageFits(page);
      assert.equal(await face(page).locator('[data-mushaf-line="1"][data-mushaf-word-index]').last().getAttribute('data-location'), '3:122:9', 'reference page 66 first line ends at وعلى');
      if (engine === chromium && [375, 390, 588, 1440].includes(viewport.width)) {
        const target = viewport.width === 1440 ? 'desktop' : viewport.width === 588 ? 'reference-size' : viewport.width === 375 ? 'iphone8' : 'mobile';
        await page.screenshot({ path: join(previewDirectory, `light-page66-${target}.png`) });
        await showTools(page);
        await page.screenshot({ path: join(previewDirectory, `light-page66-tools-${target}.png`) });
      }
      await page.evaluate(() => globalThis.mushafReaderFixture.preloadCompleteOfflineMushaf());
      await page.waitForLoadState('networkidle');
      await page.reload();
      await waitForFace(page, 66);
      assert.equal(await page.getByLabel('مصحف الطالب', { exact: true }).getAttribute('data-reader-theme'), 'light');

      await selectPage(page, 604);
      await page.keyboard.press('ArrowRight');
      assert.ok(await currentPage(page, 604).count());
      const finishSurface = page.locator('[data-mushaf-drag-surface]');
      const finishSurfaceBounds = await finishSurface.boundingBox();
      const finishGesture = { x: finishSurfaceBounds.x + finishSurfaceBounds.width / 2, y: finishSurfaceBounds.y + finishSurfaceBounds.height * 0.4 };
      await page.mouse.move(finishGesture.x, finishGesture.y);
      await page.mouse.down();
      if (viewport.width === 375) {
        await page.mouse.move(finishGesture.x, finishGesture.y + 30, { steps: 3 });
        await finishSurface.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true, pointerType: 'mouse' });
      } else {
        await page.mouse.move(finishGesture.x + 80, finishGesture.y, { steps: 6 });
      }
      await page.mouse.up();
      await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'انتهت القراءة' }).waitFor();
      assert.equal(await page.getByLabel('مصحف الطالب', { exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
      globalThis.console.log(`${engine.name()}/${viewport.width}x${viewport.height}: themes, overlay, swipe, index, fit, persistence and finish passed`);
    }
    const delayedFontContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let releaseFont;
    const fontGate = new Promise((resolve) => { releaseFont = resolve; });
    let fontRequested = false;
    await delayedFontContext.route(/\/quran\/hafs\/fonts\/(?:[^/?]+\/)*p66\.woff2(?:\?.*)?$/, async (route) => {
      fontRequested = true;
      await fontGate;
      await route.continue();
    });
    await delayedFontContext.addInitScript(() => globalThis.localStorage.setItem('nukhab_student_mushaf_reader-staff_last_page', '64'));
    const delayedFontPage = await delayedFontContext.newPage();
    await delayedFontPage.goto(`${base}/tests/fixtures/mushaf-reader.html`);
    await waitForFace(delayedFontPage, 64);
    await delayedFontPage.keyboard.press('ArrowRight');
    await waitForFace(delayedFontPage, 65);
    const beforeFontLoad = await wordPositions(delayedFontPage);
    await delayedFontPage.keyboard.press('ArrowRight');
    await delayedFontPage.waitForTimeout(300);
    assert.ok(fontRequested, 'the next face font request must be held before checking the fallback');
    assert.ok(await currentPage(delayedFontPage, 65).isVisible(), 'keep the fully loaded face while its successor font is loading');
    assertSamePositions(await wordPositions(delayedFontPage), beforeFontLoad, 'pending font must not replace the current face');
    releaseFont();
    await waitForFace(delayedFontPage, 66);
    await delayedFontContext.close();
    globalThis.console.log(`${engine.name()}: preserves the current face until the next font is ready`);
  } finally { await browser.close(); }
}
