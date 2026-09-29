import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { getBusinessDate } from '../shared/business-date.js';

const results = [];
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
      const page = await context.newPage();
      const waitForSynced = async count => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const sessions = await page.evaluate(() => globalThis.recitationFixture.store.getSessions('default:supervisor:990'));
          if (sessions.filter(row => row.status === 'synced').length === count) return;
          await page.waitForTimeout(100);
        }
        assert.fail(`Expected ${count} synchronized sessions on ${engineName}/${width}`);
      };
      const errors = [], submitted = [], ranges = [];
      page.on('pageerror', error => { errors.push(error.message); globalThis.console.error(engineName, width, error.stack); });
      const end = { page: 2, surah: 2, surahName: 'البقرة', ayah: 5 };
      const base = { studentId: 99, studentName: 'طالب الاختبار', planId: 1, planVersion: 1,
        taskDate: getBusinessDate(), track: 'memorization', fromPage: 2, toPage: 2,
        fromSurah: 2, fromSurahName: 'البقرة', fromAyah: 1, toSurah: 2, toSurahName: 'البقرة', toAyah: 5,
        attemptCount: 0, targetPages: 0.25, teacherCompleted: null, normalEnd: end,
        selectionStart: { ...end, ayah: 1 }, selectionEnd: end, selectionDirection: 1,
        options: [1, 3, 5].map(ayah => ({ ...end, ayah })) };
      const tasks = [{ ...base, id: 1, taskType: 'memorization' }, { ...base, id: 2, taskType: 'review' },
        { ...base, id: 3, taskType: 'memorization', track: 'mastery' }];
      const evaluation = { date: getBusinessDate(), tasks, taskQueue: tasks,
        students: [{ studentId: 99, studentName: base.studentName, attendanceStatus: 'present' }],
        evaluationModes: { memorization: 'count', review: 'count', mastery: 'mushaf' },
        executionSources: { memorization: 'teacher', review: 'teacher' }, evaluationPolicies: {} };
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role', 'supervisor');
        globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
        globalThis.localStorage.setItem('nukhab_web_session', '1');
      });
      await context.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path.endsWith('/offline-recitation/batch')) return route.fulfill({ status: 404, json: {} });
        if (path.endsWith('/range')) {
          const payload = request.postDataJSON(); ranges.push(payload);
          tasks[1].toAyah = payload.actualEnd.ayah;
          tasks[1].normalEnd = payload.actualEnd;
          return route.fulfill({ json: { taskIds: [2] } });
        }
        if (request.method() === 'POST' && /quran-evaluation\/\d+$/.test(path)) {
          submitted.push({ id: Number(path.split('/').at(-1)), ...request.postDataJSON() });
          return route.fulfill({ json: { ok: true, teacherCompleted: true } });
        }
        const _resolveJson = () => {
          if (path.endsWith('/quran-evaluation')) {
            return { json: evaluation };
          }
          if (path.endsWith('/chapters')) {
            return { json: [{ number: 2, name: 'البقرة', ayahCount: 286 }] };
          }
          return { json: { ok: true, ayahs: [], words: [] } };
        };
        return route.fulfill(_resolveJson());
      });
      await page.goto('http://127.0.0.1:3003/tests/fixtures/recitation-policy.html');
      await page.getByRole('button', { name: 'إتقان', exact: true }).click({ timeout: 10000 }).catch(async error => {
        await writeFile('outputs/recitation-root-browser-debug.json', JSON.stringify({ errors, text: await page.locator('body').innerText() }));
        throw error;
      });
      let dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.waitForTimeout(250);
      assert.equal(await dialog.getByRole('spinbutton').count(), 2);
      await dialog.getByRole('spinbutton', { name: 'عدد الأخطاء', exact: true }).fill('2');
      for (const name of ['متقن', 'لم يتقن']) assert.ok((await dialog.getByRole('button', { name, exact: true }).boundingBox()).height >= 44);
      await page.screenshot({ path: `outputs/recitation-root-mastery-${engineName}-${width}.png` });
      await dialog.getByRole('button', { name: width === 768 ? 'لم يتقن' : 'متقن', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await waitForSynced(1);
      assert.equal(submitted[0].id, 3);
      assert.equal(Boolean(submitted[0].notMemorized), width === 768);
      assert.equal(Number(submitted[0].mistakeCount || 0), width === 768 ? 0 : 2);
      assert.equal(submitted[0].evaluationMode, 'count');
      // Same student's memorization remains independently submittable after mastery.
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await waitForSynced(2);
      assert.deepEqual(submitted.map(row => row.id), [3, 1]);
      await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).click();
      const selector = page.getByRole('combobox', { name: 'آية النهاية', exact: true });
      assert.ok((await selector.boundingBox()).height >= 44);
      await selector.click();
      await page.getByRole('option', { name: '3', exact: true }).click();
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
      await page.screenshot({ path: `outputs/recitation-root-range-${engineName}-${width}.png` });
      await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(ranges[0].actualEnd.ayah, 3);
      await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.getByRole('button', { name: 'مراجعة', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'حفظ', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'إتقان', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'مراجعة', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'إنهاء', exact: true }).click();
      await waitForSynced(3);
      assert.equal(await page.locator('.recitation-reference-card').count(), 0);
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.getByText('لا توجد مهام للتقييم.', { exact: true }).waitFor();
      assert.equal(await page.locator('.recitation-reference-card').count(), 0);
      assert.deepEqual(errors, []);
      results.push({ engineName, width, binaryMastery: true, independentSessions: true, editableReview: true, reloadProtection: true });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile('outputs/recitation-root-browser-proof.json', JSON.stringify(results, null, 2));
globalThis.console.log(JSON.stringify(results));
