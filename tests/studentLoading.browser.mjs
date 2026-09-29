import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch();
try {
 for (const width of [360,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:3003/tests/fixtures/student-home-preview.html?slowRankings=1');
  await page.getByRole('heading',{name:'خطة اليوم',exact:true}).waitFor({timeout:8000});
  assert.equal(await page.locator('[data-loading-indicator="screen"]').count(),0);
  assert.ok(await page.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:`outputs/student-loading-${width}.png`});
  await page.close();
 }
} finally {await browser.close();}
