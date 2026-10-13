import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { normalizeSelectedWordMarks } from '../server/services/recitationMarks.js';
import { evaluateMemorization } from '../shared/grading-engine.js';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:33328';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const mushaf = JSON.parse(await readFile(new URL('../public/quran/hafs/pages/108.json', import.meta.url), 'utf8'));
const first = mushaf.words[0].location.split(':').map(Number);
const last = mushaf.words.at(-1).location.split(':').map(Number);
const policy = normalizeGradingPolicy({ weeklyProgram: { mistakeDeduction: 0.25, warningDeduction: 0.01, memorizationThresholds: [{ faces: 1, threshold: 0.4 }] } });

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const [width, markTypes] of [[320, []], [390, ['mistake', 'lahn', 'warning', 'hesitation']], [1440, ['mistake', 'mistake', 'mistake', 'lahn']]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const task = { id: 1, studentId: 99, studentName: 'طالب الاختبار', planId: 1, planVersion: 1,
        taskDate: getBusinessDate(), taskType: 'memorization', track: 'memorization', fromPage: 108, toPage: 108,
        fromSurah: first[0], fromAyah: first[1], toSurah: last[0], toAyah: last[1], targetPages: 1,
        teacherCompleted: null, attemptCount: 0 };
      const data = { date: task.taskDate, tasks: [task], taskQueue: [task],
        students: [{ studentId: 99, studentName: task.studentName, attendanceStatus: 'present' }],
        evaluationModes: { memorization: 'mushaf' }, executionSources: { memorization: 'teacher' }, gradingPolicy: policy };
      await context.addInitScript(() => {
        globalThis.localStorage.setItem('wajeh_role', 'supervisor');
        globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
        globalThis.localStorage.setItem('nukhab_web_session', '1');
        globalThis.localStorage.setItem('nukhab_mushaf_theme', 'light');
      });
      await context.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/quran-evaluation')) return route.fulfill({ json: data });
        if (path.endsWith('/ayahs')) return route.fulfill({ json: { pages: [mushaf], wordMarks: [],
          allowedRange: { fromSurah: first[0], fromAyah: first[1], toSurah: last[0], toAyah: last[1] } } });
        if (path.endsWith('/chapters')) return route.fulfill({ json: [{ number: first[0], name: 'المائدة', ayahCount: 120 }] });
        if (path.endsWith('/offline-recitation/batch')) return route.fulfill({ status: 503, json: { message: 'تنتظر المزامنة للاختبار' } });
        return route.fulfill({ json: {} });
      });
      await page.goto(`${base}/tests/fixtures/recitation-policy.html`);
      await page.getByRole('button', { name: 'حفظ', exact: true }).click();
      const session = page.getByLabel('جلسة التسميع', { exact: true });
      await session.locator('[data-mushaf-word-index]').first().waitFor();
      assert.equal(await session.getByRole('button', { name: 'راسب', exact: true }).count(), 0);
      assert.ok(await session.evaluate(element => element.scrollWidth <= element.clientWidth));
      const start = session.locator('[data-mushaf-line="4"][data-mushaf-word-index]').first();
      const end = session.locator('[data-mushaf-line="6"][data-mushaf-word-index]').nth(1);
      const from = await start.boundingBox(), to = await end.boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
      const selection = session.locator('[data-highlight-tone="selection"]');
      await selection.waitFor();
      await page.waitForFunction(() => {
        const path = globalThis.document.querySelector('[data-highlight-tone="selection"]');
        if (!path) return false;
        const svg = path.ownerSVGElement;
        const selectedWords = [...svg.parentElement.querySelectorAll('[data-mushaf-highlight-index]')];
        const bounds = svg.getBoundingClientRect();
        const rows = [4, 5].map(line => selectedWords.filter(word => Number(word.dataset.mushafLine) === line).map(word => word.getBoundingClientRect()));
        const left = Math.max(...rows.map(row => Math.min(...row.map(rect => rect.left))));
        const right = Math.min(...rows.map(row => Math.max(...row.map(rect => rect.right))));
        const upperBottom = Math.max(...rows[0].map(rect => rect.bottom));
        const lowerTop = Math.min(...rows[1].map(rect => rect.top));
        return path.isPointInFill(new globalThis.DOMPoint((left + right) / 2 - bounds.left, (upperBottom + lowerTop) / 2 - bounds.top));
      });
      await page.screenshot({ path: join(tmpdir(), `nukhab-selection-${engineName}-${width}.png`) });
      await page.mouse.up();
      const markDialog = page.getByRole('dialog');
      await markDialog.getByRole('button', { name: 'خطأ', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await markDialog.waitFor({ state: 'hidden' });
      for (const [index, type] of markTypes.entries()) {
        await session.locator('[data-mushaf-line="7"][data-mushaf-word-index]').nth(index).click();
        await page.getByRole('dialog').getByRole('button', { name: { mistake: 'خطأ', lahn: 'لحن', warning: 'تنبيه', hesitation: 'تردد' }[type], exact: true }).click();
      }
      if (width === 390) {
        await session.getByRole('button', { name: 'تفعيل المصحف الداكن', exact: true }).click();
        await page.setViewportSize({ width: 360, height: 700 });
        await page.waitForFunction(() => {
          const svg = globalThis.document.querySelector('[data-mushaf-highlights]');
          const bounds = svg.getBoundingClientRect();
          const words = [...svg.parentElement.querySelectorAll('[data-mushaf-line="7"][data-mushaf-word-index]')];
          return [...svg.querySelectorAll('path')].every((path, index) => {
            const word = words[index].getBoundingClientRect();
            return path.isPointInFill(new globalThis.DOMPoint(word.left + word.width / 2 - bounds.left, word.top + word.height / 2 - bounds.top));
          });
        });
        assert.equal(await session.locator('[data-highlight-tone="lahn"]').count(), 1);
        await page.screenshot({ path: join(tmpdir(), `nukhab-marks-dark-${engineName}.png`) });
      }
      // A device storage failure must leave all marks available for retry.
      await page.evaluate(() => {
        const store = globalThis.recitationFixture.store;
        globalThis.restoreCommit = store.commitSession;
        globalThis.commitFailures = 0;
        store.commitSession = async () => { globalThis.commitFailures += 1; throw new Error('تعذر الحفظ للاختبار'); };
      });
      await session.getByRole('button', { name: 'إنهاء', exact: true }).click();
      await page.waitForFunction(() => globalThis.commitFailures === 1);
      assert.ok(await session.isVisible());
      assert.equal(await session.locator('[data-highlight-tone]:not([data-highlight-tone="selection"])').count(), markTypes.length);
      await page.evaluate(() => { globalThis.recitationFixture.store.commitSession = globalThis.restoreCommit; });
      await context.setOffline(true);
      await session.getByRole('button', { name: 'إنهاء', exact: true }).dblclick();
      await session.waitFor({ state: 'hidden' });
      const sessions = await page.evaluate(() => globalThis.recitationFixture.store.getSessions('default:supervisor:990'));
      assert.equal(sessions.length, 1);
      const payload = sessions[0].tasks[0].payload;
      assert.equal(payload.wordMarks.length, markTypes.length);
      assert.equal(payload.notMemorized, undefined);
      assert.equal(payload.offlineOutcome.mistakeCount, markTypes.filter(type => ['mistake', 'lahn'].includes(type)).length);
      assert.equal(payload.offlineOutcome.warningCount, markTypes.filter(type => type === 'warning').length);
      assert.equal(payload.offlineOutcome.hesitationCount, markTypes.filter(type => type === 'hesitation').length);
      const marksByKey = new Map(), normalizedWordMarks = [];
      const words = mushaf.words.map(word => ({ ...word, verseKey: word.location.split(':').slice(0, 2).join(':'), page: 108, position: Number(word.location.split(':')[2]) }));
      normalizeSelectedWordMarks({ wordMarksPayload: payload.wordMarks, wordIndexByLocation: new Map(words.map((word, index) => [word.location, index])), words,
        allowedByKey: new Map(words.map(word => [word.verseKey, {}])), marksByKey, normalizedWordMarks });
      const counts = [...marksByKey.values()].reduce((sum, mark) => ({ mistakes: sum.mistakes + mark.mistakeCount,
        warnings: sum.warnings + mark.warningCount, hesitations: sum.hesitations + mark.hesitationCount }), { mistakes: 0, warnings: 0, hesitations: 0 });
      assert.equal(evaluateMemorization(policy, { faces: [counts] }).passed, payload.offlineOutcome.completed);
      assert.equal(payload.offlineOutcome.completed, width !== 1440);
      await context.setOffline(false);
      await page.reload();
      await page.waitForFunction(() => Boolean(globalThis.recitationFixture?.store));
      const restored = await page.evaluate(() => globalThis.recitationFixture.store.getSessions('default:supervisor:990'));
      assert.deepEqual(restored[0].tasks[0].payload.wordMarks, payload.wordMarks);
      assert.deepEqual(errors, []);
      await context.close();
      globalThis.console.log(`${engineName}/${width}: connected highlight, stored marks, automatic outcome, retry and reload passed`);
    }
  } finally { await browser.close(); }
}
