import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const browser=await chromium.launch({ headless:true });
try {
  for (const width of [320,390,1440]) {
    const page=await browser.newPage({ viewport:{ width,height:950 } });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:3019/tests/fixtures/review-group.html');
    const dialog=page.getByRole('dialog');
    await dialog.getByText('درجة المراجعة: 1.00',{exact:true}).waitFor();
    for (const id of [1,2,3,4]) await page.locator(`#recitation-warning-count-${id}`).fill('15');
    await dialog.getByText('درجة المراجعة: 0.40',{exact:true}).waitFor();
    assert.equal(await dialog.getByRole('status').count(),0);
    await page.locator('#recitation-warning-count-1').fill('16');
    await dialog.getByText('درجة المراجعة: 0.00',{exact:true}).waitFor();
    await dialog.getByRole('status').getByText('تجاوز الحزب 1 حد الخصم؛ تحتاج المراجعة كاملة إلى إعادة.',{exact:true}).waitFor();
    assert.equal(await page.locator('#recitation-warning-count-2').inputValue(),'15');
    assert.equal(await dialog.getByText(/النتيجة الحالية/).count(),0,'review displays one total grade');
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await dialog.locator('section').first().evaluate(el=>{ el.parentElement.scrollTop=0; });
    await dialog.screenshot({ path:join(tmpdir(),`nukhab-review-group-${width}.png`),animations:'disabled' });
    await page.locator('#recitation-warning-count-1').fill('15');
    await dialog.getByText('درجة المراجعة: 0.40',{exact:true}).waitFor();
    assert.equal(await dialog.getByRole('status').count(),0);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  globalThis.console.log('Review browser passed at 320/390/1440: one grade, inclusive cap, whole failure, independent counters, RTL/no overflow.');
} finally { await browser.close(); }
