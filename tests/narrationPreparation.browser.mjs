import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { URL } from 'node:url';
const base = globalThis.process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3109';
const browser = await chromium.launch();
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let failedLoad = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/committees')) body = [{ id: 5, name: 'حلقة أ' }, { id: 6, name: 'حلقة ب' }];
      else if (path.endsWith('/preparation')) {
        if (failedLoad) { await route.fulfill({ status: 500, json: { message: 'تعذر تحميل الطلاب' } }); return; }
        body = [{ id: 9, name: 'أحمد', committeeId: 5, committeeName: 'حلقة أ' }, { id: 10, name: 'محمد', committeeId: 6, committeeName: 'حلقة ب' }, { id: 11, name: 'خالد', committeeId: 5, committeeName: 'حلقة أ' }];
      } else if (path.endsWith('/chapters')) body = [{ number: 1, name: 'الفاتحة', ayahCount: 7 }, { number: 114, name: 'الناس', ayahCount: 6 }];
      else if (path.endsWith('/preview-ranges')) body = route.request().postDataJSON().ranges.map(range => ({ ...range, faces: 1 }));
      else if (path.endsWith('/narration-events') && route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); body = { id: 7, studentsCount: 2 }; }
      else if (path.endsWith('/narration-events/7')) body = { id: 7, name: 'سرد التجربة', status: 'open', students: [] };
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/tests/fixtures/narration-refinements.html`);
    const open = async () => { await page.getByRole('button', { name: 'فتح يوم سرد', exact: true }).click(); await page.getByRole('button', { name: 'يدوي', exact: true }).waitFor(); };
    await open();
    await page.getByRole('button', { name: 'يدوي', exact: true }).click();
    await page.getByLabel('اسم يوم السرد', { exact: true }).fill('سرد التجربة');
    await page.getByLabel('تحديد أحمد', { exact: true }).check();
    await page.getByLabel('تحديد محمد', { exact: true }).check();
    await page.getByRole('button', { name: 'تحديد مقاطع المحددين (2)', exact: true }).click();
    const choose = async (index, label) => {
      await page.locator('fieldset').filter({ has: page.locator('legend') }).last().getByRole('combobox').nth(index).click();
      await page.getByRole('option', { name: label, exact: true }).click();
    };
    await choose(0, 'الفاتحة'); await choose(1, '1'); await choose(2, 'الفاتحة'); await choose(3, '7');
    await page.getByRole('button', { name: 'إضافة مقطع', exact: true }).click();
    await choose(0, 'الناس'); await choose(1, '1'); await choose(2, 'الناس'); await choose(3, '6');
    await page.getByRole('button', { name: 'إغلاق وحفظ المسودة', exact: true }).click();
    // Reload before applying: raw editor state must survive navigation.
    await page.reload(); await open();
    await page.getByRole('button', { name: 'اعتماد المقاطع', exact: true }).click();
    await page.getByRole('button', { name: 'تعديل المقاطع', exact: true }).first().waitFor();
    assert.equal(await page.getByText('الأوجه: 2', { exact: true }).count(), 2);
    await page.getByRole('button', { name: 'تعديل المقاطع', exact: true }).first().click();
    await page.getByRole('button', { name: 'حذف المقطع 2', exact: true }).click();
    await page.getByRole('button', { name: 'اعتماد المقاطع', exact: true }).click();
    await page.getByText('الأوجه: 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'إغلاق وحفظ المسودة', exact: true }).click();
    await page.reload(); await open();
    assert.equal(await page.getByText('الأوجه: 2', { exact: true }).count(), 1);
    assert.equal(await page.getByText('الأوجه: 1', { exact: true }).count(), 1);
    await page.getByLabel('البحث عن طالب', { exact: true }).fill('خالد');
    assert.equal(await page.getByRole('list', { name: 'تجهيز طلاب السرد' }).locator(':scope > li').count(), 1);
    await page.getByLabel('البحث عن طالب', { exact: true }).fill('');
    await page.getByRole('button', { name: 'حلقات يوم السرد', exact: true }).click();
    await page.getByRole('checkbox', { name: 'حلقة أ', exact: true }).check();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('list', { name: 'تجهيز طلاب السرد' }).locator(':scope > li').count(), 2);
    await page.getByRole('button', { name: 'حلقات يوم السرد', exact: true }).click();
    await page.getByRole('checkbox', { name: 'جميع الحلقات', exact: true }).check();
    await page.keyboard.press('Escape');
    assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    const boxes = await page.getByRole('list', { name: 'تجهيز طلاب السرد' }).locator(':scope > li').evaluateAll(items => items.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })));
    assert.ok(boxes.every(box => box.left >= 0 && box.right <= width));
    await page.getByRole('button', { name: 'مراجعة وبدء', exact: true }).click();
    await page.getByText('المشاركون: 2 · بدون مقاطع: 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'بدء السرد', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].mode, 'manual');
    assert.deepEqual(writes[0].assignments.map(item => item.ranges.length), [1, 2]);
    await open();
    assert.equal(await page.getByLabel('اسم يوم السرد', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'المحفوظ كامل', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'إغلاق وحفظ المسودة', exact: true }).click();
    failedLoad = true; await open();
    await page.getByRole('button', { name: 'يدوي', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'تعذر تحميل الطلاب' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'مراجعة وبدء', exact: true }).isDisabled(), true);
    failedLoad = false;
    await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await page.close();
    globalThis.console.log(`Narration preparation passed at ${width}px: multiple excerpts, bulk apply, search, circles, draft restoration, summary, submission, reset, and load failure recovery.`);
  }
} finally { await browser.close(); }
