import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const origin = globalThis.process.env.RECITATION_TEST_ORIGIN || 'http://127.0.0.1:3000';
const output = 'outputs/recitation-attendance-20261101';
await mkdir(output, { recursive: true });
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/tests/fixtures/recitation-attendance-retention.html`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('combobox', { name: 'تحضير طالب محفوظ', exact: true }).waitFor();
      const original = await page.evaluate(() => ({ tasks: globalThis.attendanceRetentionFixture.data.tasks,
        queue: globalThis.attendanceRetentionFixture.data.taskQueue, receipts: globalThis.attendanceRetentionFixture.data.deliveryReceipts }));
      for (const [name, studentId] of [['طالب محفوظ', 8], ['طالب ينتظر التسميع', 9]]) {
        for (const [status, label] of [['absent', 'غائب'], ['present', 'حاضر'], ['excused', 'مستأذن'], ['present', 'حاضر'], ['absent', 'غائب']]) {
          await page.getByRole('combobox', { name: `تحضير ${name}`, exact: true }).click();
          await page.getByRole('option', { name: label, exact: true }).click();
          await page.waitForFunction(({ studentId, status }) => globalThis.attendanceRetentionFixture.data.students
            .some(student => student.studentId === studentId && student.attendanceStatus === status), { studentId, status });
          assert.equal(await page.getByRole('combobox', { name: `تحضير ${name}`, exact: true }).count(), 1);
          if (studentId === 9) assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), status === 'present' ? 1 : 0);
        }
      }
      const final = await page.evaluate(() => ({ tasks: globalThis.attendanceRetentionFixture.data.tasks,
        queue: globalThis.attendanceRetentionFixture.data.taskQueue, receipts: globalThis.attendanceRetentionFixture.data.deliveryReceipts }));
      assert.deepEqual(final, original);
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
      assert.deepEqual(errors, []);
      if (engineName === 'chromium') await page.screenshot({ path: `${output}/${width}-absent.png`, fullPage: true });
      await page.close();
      console.log(`${engineName} ${width}px: repeated attendance edits retain both pupils, work and accepted results; absent actions blocked; no overflow.`);
    }
  } finally { await browser.close(); }
}
