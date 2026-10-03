import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { getBusinessDate } from '../shared/business-date.js';
const browser = await chromium.launch({ headless: true });
const date = getBusinessDate();
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => globalThis.localStorage.setItem('wajeh_supervisor_id', '2'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let json = [];
      if (path.endsWith('/reports/students')) json = [{ id: 1, name: 'طالب تجريبي' }];
      if (path.endsWith('/reports/student-recitation-history')) json = { rows: [{ id: 1, taskId: 10, studentId: 1, planId: 3, evaluatorId: 2, sessionId: '9ce68b0e-749e-4da1-8e6e-58d7f52b7a3d', sessionDate: date, taskDate: date, taskType: 'memorization', track: 'memorization', fromPage: 1, toPage: 1, fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, teacherCompleted: false, warningCount: 2, mistakeCount: 1 }] };
      if (path.endsWith('/quran-evaluation')) json = { evaluationModes: { memorization: 'count' } };
      if (path.endsWith('/offline-recitation/batch')) {
        const body = route.request().postDataJSON(); writes.push(body);
        json = { results: [{ result: 'accepted', tasks: [{ taskId: 10, result: 'accepted' }] }] };
      }
      if (path.endsWith('/reading')) { writes.push(route.request().postDataJSON()); json = { status: 'read', recordedFaces: 7.5 }; }
      await route.fulfill({ json });
    });
    await page.goto('http://localhost:3107/tests/fixtures/audit-settings.html?section=history');
    await page.getByText('طالب تجريبي', { exact: true }).click();
    await page.getByRole('button', { name: 'تصحيح التقييم', exact: true }).click();
    await page.getByRole('button', { name: 'متابعة التصحيح' }).click();
    await page.getByLabel('عدد الأخطاء', { exact: true }).fill('0');
    await page.getByLabel('عدد التنبيهات', { exact: true }).fill('1');
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(writes[0].sessions[0].tasks[0].payload.correctionOf, '9ce68b0e-749e-4da1-8e6e-58d7f52b7a3d');
    assert.equal(writes[0].sessions[0].tasks[0].payload.mistakeCount, 0);
    await page.evaluate(async () => { globalThis.auditOperations = await import('../../src/services/offlineOperationsService.js'); });
    await page.context().setOffline(true);
    const pending = await page.evaluate(async date => {
      const operations = globalThis.auditOperations;
      await operations.commitOfflineOperation(2, 'self_reading', { supervisorId: 2, studentId: 1, date, completed: true, faces: 7.5 }, { dedupeKey: `reading:2:1:${date}` });
      const state = await operations.mergeOfflineReading(2, { date, reading: [{ studentId: 1, status: null }] });
      const synced = await operations.syncOfflineActions(2, { force: true });
      return { state, synced };
    }, date);
    assert.equal(pending.state.reading[0].recordedFaces, 7.5);
    assert.equal(pending.state.reading[0].pendingSync, true);
    assert.deepEqual(pending.synced, []);
    await page.context().setOffline(false);
    const synced = await page.evaluate(async () => {
      const operations = globalThis.auditOperations;
      return [await operations.syncOfflineActions(2, { force: true }), await operations.syncOfflineActions(2, { force: true })];
    });
    assert.equal(synced[0][0].status, 'synced');
    assert.equal(synced[1].length, 0);
    assert.equal(writes.length, 2);
    assert.deepEqual(errors, []);
    await page.close();
    globalThis.console.log(`Correction and offline reading passed at ${width}px.`);
  }
} finally { await browser.close(); }
