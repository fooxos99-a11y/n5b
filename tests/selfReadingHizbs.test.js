import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveReadingHizbs } from '../server/services/selfReadingHizbs.js';
import { loadTeacherReading, saveTeacherReading } from '../server/services/selfReading.js';
import { getBusinessDate } from '../shared/business-date.js';
import { measureQuranFaces } from '../server/services/quranFaceMeasurement.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { evaluateReading } from '../shared/grading-engine.js';
import layout from '../server/data/quranVerseLineLayout.js';
import { validatePlanReadingHizbs } from '../shared/quran-plan-options.js';

test('a hizb-based daily target grades by the ahzab count and validates plan amounts', () => {
  assert.equal(validatePlanReadingHizbs(60), 60);
  assert.equal(validatePlanReadingHizbs(undefined), null);
  for (const count of [0, 61, 1.5, '', 'bad']) assert.throws(() => validatePlanReadingHizbs(count), { status: 422 });
  const policy = { weeklyProgram: { readingDaily: 2 } };
  assert.equal(evaluateReading(policy, { completed: true, requiredFaces: 11, expectedFaces: 10, requiredHizbs: 1, expectedHizbs: 2 }).grade, 1);
  assert.equal(evaluateReading(policy, { completed: true, requiredFaces: 21, expectedFaces: 10, requiredHizbs: 2, expectedHizbs: 2 }).grade, 2);
  assert.equal(evaluateReading(policy, { completed: false, requiredHizbs: 2, expectedHizbs: 2 }).grade, 0);
});

test('pending offline reading preserves Quran ahzab and is isolated by student and date', async () => {
  const source = await readFile(new URL('../src/services/offlineOperationsService.js', import.meta.url), 'utf8');
  const actions = [{ actionType: 'self_reading', payload: { studentId: 3, date: '2026-10-01', completed: true, amount: { faces: 20, fromHizb: 59, toHizb: 60, hizbCount: 2 } } },
    { actionType: 'self_reading', payload: { studentId: 4, date: '2026-09-30', completed: false, fromHizb: 1, toHizb: 1 } }];
  const context = vm.createContext({ offlineActorKey: id => `teacher:${id}`, offlineRecitationStore: { getActions: async key => { assert.equal(key, 'teacher:7'); return actions; } } });
  vm.runInContext(source.slice(source.indexOf('export async function mergeOfflineReading')).replace('export ', ''), context);
  const data = { date: '2026-10-01', reading: [{ studentId: 3, status: null }, { studentId: 4, status: 'read', hizbCount: 1 }] };
  const merged = await context.mergeOfflineReading(7, data);
  assert.equal(merged.reading[0].hizbCount, 2);
  assert.equal(merged.reading[0].fromHizb, 59);
  assert.equal(merged.reading[0].pendingSync, true);
  assert.equal(merged.reading[1], data.reading[1]);
});

test('Quran reading uses exact ayah boundaries for first, last and multi-surah ahzab', () => {
  const first = resolveReadingHizbs(1, 1);
  assert.deepEqual(first.range, { startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 74 });
  assert.equal(first.hizbCount, 1);
  const last = resolveReadingHizbs(60, 60);
  assert.deepEqual(last.range, { startSurah: 87, startAyah: 1, endSurah: 114, endAyah: 6 });
  assert.notEqual(last.faces, 10, 'Ahzab do not have a fixed ten-face length');
  assert.equal(resolveReadingHizbs(1, 60).hizbCount, 60);
  // Preserve the project's line-based face measure, which excludes unallocated blank space.
  assert.equal(resolveReadingHizbs(1, 60).faces, measureQuranFaces({ surah: 1, ayah: 1 }, { surah: 114, ayah: 6 }));
  for (let hizb = 1; hizb <= 60; hizb++) assert.ok(resolveReadingHizbs(hizb, hizb).faces > 0);
  for (const args of [[0, 1], [1, 61], [2, 1], [1.5, 2], [NaN, 2], [null, 1]]) {
    assert.throws(() => resolveReadingHizbs(...args), { status: 422 });
  }
});

test('reading assigns only memorized material, ignores client ranges, excludes unauthorized staff and keeps saved amounts stable', async () => {
  let detail = null, writes = 0, available = true;
  const connection = { query: async (sql, params = []) => {
    if (sql.includes('JOIN supervisor_committees')) return [params[0] === 7 ? [{ studentId: 3, studentName: 'طالب', planFaces: 10,
      passed: detail ? (detail.passed ? 1 : 0) : null, recordedFaces: detail?.requiredFaces, readingDetail: detail,
      fromHizb: detail?.fromHizb, toHizb: detail?.toHizb, hizbCount: detail?.hizbCount }] : []];
    if (sql.includes('FROM student_quran_plan_prior_memorization')) return [available ? [{ startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 286 }] : []];
    if (sql.includes('FROM quran_ayah_pages')) return [layout.map(([key, page]) => { const [surah, ayah] = key.split(':').map(Number); return { surah, ayah, page, juz: 1 }; })];
    if (sql.includes('AS joined')) return [[{ joined: '2020-01-01' }]];
    if (sql.includes('INSERT INTO student_daily_grades')) { detail = JSON.parse(params[10]); writes++; return [{}]; }
    if (sql.includes('DELETE FROM student_daily_grades')) { detail = null; return [{}]; }
    return [[]];
  } };
  const payload = { supervisorId: 7, studentId: 3, date: getBusinessDate(), completed: true, fromHizb: 60, toHizb: 60, faces: 604 };
  const row = await saveTeacherReading(connection, payload);
  assert.equal(row.recordedFaces, 10);
  assert.equal(row.amount.ranges[0].startPage, 1);
  assert.equal(row.amount.ranges.at(-1).endPage, 10);
  assert.equal(detail.grade, detail.max);
  assert.equal((await loadTeacherReading(connection, { supervisorId: 7, date: payload.date })).students[0].amount.faces, 10);
  assert.equal(await saveTeacherReading(connection, { ...payload, supervisorId: 8 }), null);
  assert.equal(writes, 1);
  await saveTeacherReading(connection, { ...payload, fromHizb: 61, faces: -1 });
  assert.equal(detail.requiredFaces, 10);
  await saveTeacherReading(connection, { ...payload, completed: false });
  assert.equal(detail.grade, 0);
  await saveTeacherReading(connection, { ...payload, completed: null });
  assert.equal(detail, null);
  available = false;
  await assert.rejects(saveTeacherReading(connection, payload), { status: 422 });
});
