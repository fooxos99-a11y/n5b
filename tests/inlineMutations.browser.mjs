import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch();
try {
 for(const width of [360,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:3003/tests/fixtures/inline-mutations.html');
  const memorization=page.getByRole('button',{name:/^حفظ/}).first();
  const review=page.getByRole('button',{name:/^المراجعة|^مراجعة/}).first();
  await memorization.click();
  await page.waitForTimeout(350);
  assert.equal(await review.isEnabled(),true,'other execution stays enabled during reload');
  await review.click();
  await page.waitForFunction(()=>globalThis.fixture.writes.length===2);
  await page.waitForTimeout(1200);
  assert.equal(await memorization.getAttribute('aria-pressed'),'true');
  assert.equal(await review.getAttribute('aria-pressed'),'true');
  const link=page.locator('.student-home-task').filter({hasText:'ربط'});
  await link.click();
  await page.waitForTimeout(300);
  assert.equal(await link.getAttribute('aria-pressed'),'false','failed save is not shown as complete');
  await page.getByRole('button',{name:'تعديل',exact:true}).click();
  await page.locator('#store-product-name').fill('منتج معدل');
  await page.getByRole('button',{name:'حفظ',exact:true}).click();
  await page.getByText('منتج معدل',{exact:true}).waitFor();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>globalThis.fixture.storeReads),1,'save must not refetch the store');
  await page.screenshot({path:`outputs/inline-mutations-${width}.png`});
  await page.close();
 }
} finally {await browser.close();}

