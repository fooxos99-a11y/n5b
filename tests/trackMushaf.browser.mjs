import assert from 'node:assert/strict';
import process from 'node:process';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { createTemporaryArtifactDirectory } from './helpers/temporaryArtifacts.mjs';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3119';
const artifacts = createTemporaryArtifactDirectory();
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 1440]) {
      const page = await browser.newPage({ viewport:{ width,height:900 }, hasTouch:width === 360, reducedMotion:'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/tests/fixtures/track-test-segments.html`);
      await page.getByRole('button', { name:'اختبار الطالب التجريبي',exact:true }).click();
      const open = async () => {
        await page.getByRole('button', { name:'فتح المصحف',exact:true }).click();
        await page.getByLabel('جلسة التسميع', { exact:true }).locator('[data-mushaf-word-index]').first().waitFor();
      };
      const session = page.getByLabel('جلسة التسميع', { exact:true });
      const mark = async (index, label) => {
        const word = session.locator('[data-mushaf-word-index]').nth(index);
        if (width === 360) await word.tap(); else await word.click();
        await page.getByRole('dialog', { name:'تحديد موضع التسميع',exact:true }).getByRole('button', { name:label,exact:true }).click();
      };
      const back = async () => {
        // Escape is the shared full-screen back action and retains local word marks.
        await session.focus();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name:'فتح المصحف',exact:true }).waitFor();
      };
      const finish = async () => {
        const button = session.locator('.mushaf-finish-button');
        if (!await button.isVisible()) {
          const face = session.locator('.mushaf-page-turn .mushaf-page');
          const box = await face.boundingBox();
          await face.click({position:{x:3,y:box.height/2}});
        }
        await button.waitFor();
        return button;
      };
      const count = async (label, expected) => assert.equal(await page.getByRole('spinbutton', {name:label,exact:true}).inputValue(), String(expected));
      await open();
      await mark(0,'خطأ');
      await mark(1,'تنبيه');
      await mark(2,'تردد');
      await mark(3,'لحن');
      for (const tone of ['mistake','warning','hesitation','lahn']) await session.locator(`[data-highlight-tone="${tone}"]`).waitFor();
      assert.equal(await session.locator('[data-highlight-tone="mistake"]').count(),1);
      assert.equal(await session.locator('[data-highlight-tone="warning"]').count(),1);
      assert.equal(await session.locator('[data-highlight-tone="hesitation"]').count(),1);
      assert.equal(await session.locator('[data-highlight-tone="lahn"]').count(),1);
      assert.equal(await session.evaluate(element => element.scrollWidth <= element.clientWidth),true);
      await page.screenshot({ path:join(artifacts,`track-mushaf-${engineName}-${width}.png`) });
      // Editing and deleting an existing word mark update only its contribution.
      await mark(0,'تنبيه');
      await mark(0,'مسح');
      await back();
      await count('الأخطاء',1); await count('التنبيهات',1); await count('الترددات',1);
      // Manual counts cannot undercut marks, and reopening restores their word highlights.
      await page.getByRole('spinbutton',{name:'الأخطاء',exact:true}).fill('0');
      await count('الأخطاء',1);
      await open();
      await session.locator('[data-highlight-tone="lahn"]').waitFor();
      assert.equal(await session.locator('[data-highlight-tone="lahn"]').count(),1);
      assert.equal(await session.locator('[data-highlight-tone="mistake"]').count(),0);
      await session.getByRole('button',{name:'المقطع التالي',exact:true}).click();
      await session.locator('[data-mushaf-word-index]').first().waitFor();
      await mark(0,'خطأ'); await mark(1,'تنبيه'); await mark(2,'تردد');
      await session.getByRole('button',{name:'المقطع السابق',exact:true}).click();
      await session.locator('[data-highlight-tone="lahn"]').waitFor();
      await session.getByRole('button',{name:'المقطع التالي',exact:true}).click();
      for (const tone of ['mistake','warning','hesitation']) {
        await session.locator(`[data-highlight-tone="${tone}"]`).waitFor();
        assert.equal(await session.locator(`[data-highlight-tone="${tone}"]`).count(),1);
      }
      assert.equal(await session.getByRole('button',{name:'المقطع التالي',exact:true}).isDisabled(),true);
      for (const name of ['المقطع السابق','المقطع التالي']) {
        const box = await session.getByRole('button',{name,exact:true}).boundingBox();
        assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
      }
      assert.equal(await session.evaluate(element => element.scrollWidth <= element.clientWidth),true);
      await session.getByRole('button',{name:'المقطع السابق',exact:true}).click();
      await session.locator('[data-highlight-tone="warning"]').waitFor();
      await finish();
      assert.doesNotMatch(await session.innerText(), /حفظ جلسة المسار|المقطع [12] من|مقطع عشوائي آخر/);
      await page.screenshot({path:join(artifacts,`track-navigation-${engineName}-${width}.png`)});
      const save = await finish();
      await save.evaluate(button => { button.click(); button.click(); });
      await page.waitForFunction(() => globalThis.document.querySelector('.mushaf-finish-button')?.disabled);
      for (const name of ['المقطع السابق','المقطع التالي']) {
        assert.equal(await session.getByRole('button',{name,exact:true}).isDisabled(),true);
      }
      assert.equal(await page.getByRole('button',{name:'فتح المصحف',exact:true}).count(),0);
      await session.focus(); await page.keyboard.press('Escape');
      assert.equal(await session.isVisible(),true,'saving blocks closing the Mushaf');
      await page.getByLabel('نتيجة الاختبار').waitFor();
      const result = JSON.parse(await page.getByLabel('نتيجة الاختبار').innerText());
      assert.equal(await page.getByLabel('عدد طلبات الحفظ').innerText(),'1');
      assert.ok(result.every(segment => segment.recorded));
      assert.equal(result[0].wordMarks.length,3);
      assert.equal(result[1].wordMarks.length,3);
      assert.deepEqual([result[1].mistakes,result[1].warnings,result[1].hesitations],[1,1,1]);
      assert.deepEqual([result[0].mistakes,result[0].warnings,result[0].hesitations],[1,1,1]);
      for (const failure of ['save-failure', ...(engineName === 'chromium' && width === 360 ? ['save-throw'] : [])]) {
        await page.goto(`${base}/tests/fixtures/track-test-segments.html?${failure}`);
        await page.getByRole('button',{name:'اختبار الطالب التجريبي',exact:true}).click();
        await open(); await mark(0,'تنبيه');
        await session.getByRole('button',{name:'المقطع التالي',exact:true}).click();
        await session.locator('[data-mushaf-word-index]').first().waitFor();
        await mark(0,'خطأ');
        await (await finish()).click();
        await session.getByRole('alert').waitFor();
        assert.equal(await session.locator('[data-highlight-tone="mistake"]').count(),1);
        assert.equal(await page.getByRole('button',{name:'فتح المصحف',exact:true}).count(),0);
        await session.getByRole('button',{name:'المقطع السابق',exact:true}).click();
        await session.locator('[data-highlight-tone="warning"]').waitFor();
        await (await finish()).click();
        await page.getByLabel('نتيجة الاختبار').waitFor();
        const retried = JSON.parse(await page.getByLabel('نتيجة الاختبار').innerText());
        assert.equal(await page.getByLabel('عدد طلبات الحفظ').innerText(),'2');
        assert.deepEqual(retried.map(segment => segment.wordMarks[0].markType),['warning','mistake']);
        assert.deepEqual(retried.map(segment => [segment.mistakes,segment.warnings,segment.hesitations]),[[0,1,0],[1,0,0]]);
      }
      await page.goto(`${base}/tests/fixtures/track-test-segments.html?load-failure`);
      await page.getByRole('button', { name:'اختبار الطالب التجريبي',exact:true }).click();
      await page.getByRole('button', { name:'فتح المصحف',exact:true }).click();
      await session.getByRole('alert').waitFor();
      await session.getByRole('button', { name:'إعادة المحاولة',exact:true }).click();
      await session.locator('[data-mushaf-word-index]').first().waitFor();
      await mark(0,'تنبيه');
      await back();
      await count('التنبيهات',1);
      assert.deepEqual(errors,[]);
      await page.close();
      globalThis.console.log(`${engineName} track word marking passed at ${width}px`);
    }
  } finally { await browser.close(); }
}
globalThis.console.log(`Screenshots: ${artifacts}`);
