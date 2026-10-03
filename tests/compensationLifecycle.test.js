import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import ExcelJS from 'exceljs';
import { subscribeLiveKitPresence, notifyLiveKitPresence } from '../server/services/livekitPresenceEvents.js';
import { buildOverviewExcel, buildArchiveExcel } from '../server/services/reportExportBuilders.js';

test('signed presence dispatch retains each viewer tenant context and unsubscribes cleanly', () => {
  const tenants = new AsyncLocalStorage();
  const seen = [];
  const unsubscribe = ['first', 'second'].map(tenant => tenants.run(tenant,
    () => subscribeLiveKitPresence(room => seen.push([tenants.getStore(), room]))));
  notifyLiveKitPresence('room');
  assert.deepEqual(seen, [['first', 'room'], ['second', 'room']]);
  unsubscribe.forEach(stop => stop());
  notifyLiveKitPresence('another-room');
  assert.equal(seen.length, 2);
});

test('current and archived Excel exports retain hesitation and cancellation audit values', async () => {
  const report = { grades: {
    trackSession: { studentsList: [{ name: 'طالب الاختبار', segments: { mistakes: 1, warnings: 2, hesitations: 3, compensated: 4 } }] },
    compensations: [{ studentName: 'طالب الاختبار', scope: 'program', date: '2026-10-01', actorName: 'مشرف المسار',
      recordedAt: '2026-10-02T12:30:00', excuseReference: 'طلب معتمد', cancelledByName: 'المدير',
      cancelledAt: '2026-10-02T13:00:00', cancellationReason: 'تصحيح اليوم المحدد' }],
  } };
  for (const buffer of [await buildOverviewExcel(report), await buildArchiveExcel({ overviewReport: report })]) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    assert.equal(workbook.worksheets[0].name, 'الملخص');
    assert.equal(workbook.getWorksheet('تقييم المقاطع').getRow(5).getCell(5).value, 3);
    const audit = workbook.getWorksheet('سجل التعويض').getRow(5);
    assert.equal(audit.getCell(4).value, '2026-10-01');
    assert.equal(audit.getCell(5).value, 'مشرف المسار');
    assert.equal(audit.getCell(8).value, 'ملغى');
    assert.equal(audit.getCell(11).value, 'تصحيح اليوم المحدد');
  }
});
