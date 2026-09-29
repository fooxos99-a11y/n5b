import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('الطلاب');
sheet.addRow(['الاسم', 'جوال ولي الأمر', 'رقم الهوية', 'الحلقة', 'رقم الدخول', 'كلمة المرور']);
sheet.addRow(['طالب تجريبي', '0500000000', '1000000000', 'حلقة اختبار', '', '']);
const spreadsheet = Buffer.from(await workbook.xlsx.writeBuffer());
const browser = await chromium.launch();
try {
  for (const width of [360, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-09-29T12:00:00Z'));
    let trackDetail;
    await page.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (req.method() !== 'GET') {
        const body = req.postDataJSON(); writes.push({ path, body });
        if (path.endsWith('/weekly-component')) trackDetail = { attended: body.attended, segments: body.segments };
        return route.fulfill({ json: { id: 999, count: 1, ok: true } });
      }
      const json = path.endsWith('/committees') || path.endsWith('/audience') ? [{ id: 1, name: 'حلقة اختبار' }]
        : path.includes('/student-news') ? { entries: [], revision: 0 }
          : path.endsWith('/grading/policy') ? { policy: normalizeGradingPolicy() }
            : path.endsWith('/grading/week') ? { weekStart: '2026-09-27', policy: normalizeGradingPolicy(), students: [{ id: 1, name: 'طالب تجريبي', committeeName: 'حلقة اختبار', grade: { trackDetail } }] }
              : [];
      return route.fulfill({ json });
    });
    await page.goto('http://127.0.0.1:3000/tests/fixtures/student-credentials.html');
    await page.getByRole('button', { name: 'إضافة طالب', exact: true }).click();
    await page.getByLabel('ملف الطلاب').setInputFiles({ name: 'students.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: spreadsheet });
    await page.getByRole('columnheader', { name: 'رقم الهوية', exact: true }).waitFor();
    assert.equal(await page.getByRole('columnheader').count(), 8);
    const number = page.getByLabel('رقم دخول الطالب 1', { exact: true });
    const password = page.getByLabel('كلمة مرور الطالب 1', { exact: true });
    assert.equal(await password.inputValue(), await number.inputValue());
    assert.equal(await page.getByLabel('رقم هوية الطالب 1', { exact: true }).inputValue(), '1000000000');
    await number.fill('10'); assert.equal(await password.inputValue(), '10');
    await password.fill('12'); await number.fill('11'); assert.equal(await password.inputValue(), '12');
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/web-bulk-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const bulk = writes.find(row => row.path.endsWith('/students/bulk')).body.students[0];
    assert.equal(bulk.loginNumber, '11'); assert.equal(bulk.password, '12'); assert.equal(bulk.nationalId, '1000000000');

    await page.goto('http://127.0.0.1:3000/tests/fixtures/student-news.html?editor');
    await page.getByRole('button', { name: 'إضافة خبر', exact: true }).click();
    assert.equal(await page.getByLabel('اللون', { exact: true }).inputValue(), '#000000');
    const circle = await page.getByRole('button', { name: 'جميع الحلقات', exact: true }).boundingBox();
    assert.ok(circle.width <= 193);
    await page.screenshot({ path: `outputs/web-news-${width}.png`, animations: 'disabled' });
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();

    await page.goto('http://127.0.0.1:3000/tests/fixtures/weekly-refinements.html?section=track');
    await page.getByRole('radio', { name: 'حاضر', exact: true }).click();
    const test = page.getByRole('button', { name: 'اختبر', exact: true });
    await test.waitFor();
    assert.ok((await test.boundingBox()).x > (await page.getByRole('radio', { name: 'غائب', exact: true }).boundingBox()).x);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await page.screenshot({ path: `outputs/web-track-${width}.png`, animations: 'disabled' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  globalThis.console.log('PASS: XLSX columns and editable matching credentials, news defaults and size, track action position on phone and desktop');
} finally { await browser.close(); }
