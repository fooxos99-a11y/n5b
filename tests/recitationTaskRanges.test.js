import test from 'node:test';
import assert from 'node:assert/strict';
import { formatContinuousRecitationRange, sortRecitationTasks } from '../src/lib/recitationTaskRanges.js';

test('recitation pieces follow Quran order instead of generation date', () => {
  const tasks = [
    { id: 2, planId: 1, taskDate: '2026-08-21', fromPage: 2, fromSurah: 2, fromAyah: 6, toPage: 2, toSurah: 2, toAyah: 6, fromSurahName: 'البقرة', toSurahName: 'البقرة' },
    { id: 5, planId: 1, taskDate: '2026-08-22', fromPage: 2, fromSurah: 2, fromAyah: 1, toPage: 2, toSurah: 2, toAyah: 5, fromSurahName: 'البقرة', toSurahName: 'البقرة' },
  ];

  assert.deepEqual(sortRecitationTasks(tasks).map((task) => task.id), [5, 2]);
  assert.equal(formatContinuousRecitationRange(tasks), 'من البقرة\u00a01 إلى 6');
});

test('surah names stay attached to ayah numbers in narrow recitation cards', () => {
  const tasks = [{
    id: 1,
    planId: 1,
    taskDate: '2026-08-24',
    fromPage: 1,
    fromSurah: 1,
    fromAyah: 1,
    toPage: 2,
    toSurah: 2,
    toAyah: 1,
    fromSurahName: 'الفاتحة',
    toSurahName: 'البقرة',
  }];

  assert.equal(formatContinuousRecitationRange(tasks), 'من الفاتحة\u00a01 إلى البقرة\u00a01');
});

test('continuous completed surahs collapse into one clear report range', () => {
  const tasks = [
    {
      id: 1, planId: 1, taskDate: '2026-08-30', fromPage: 586, fromSurah: 81, fromAyah: 1,
      toPage: 586, toSurah: 81, toAyah: 29, toSurahAyahCount: 29,
      fromSurahName: 'التكوير', toSurahName: 'التكوير',
    },
    {
      id: 2, planId: 1, taskDate: '2026-08-31', fromPage: 587, fromSurah: 82, fromAyah: 1,
      toPage: 587, toSurah: 82, toAyah: 19, toSurahAyahCount: 19,
      fromSurahName: 'الانفطار', toSurahName: 'الانفطار',
    },
    {
      id: 3, planId: 1, taskDate: '2026-09-01', fromPage: 587, fromSurah: 83, fromAyah: 1,
      toPage: 589, toSurah: 83, toAyah: 30, toSurahAyahCount: 36,
      fromSurahName: 'المطففين', toSurahName: 'المطففين',
    },
  ];

  assert.equal(formatContinuousRecitationRange(tasks), 'من التكوير\u00a01 إلى المطففين\u00a030');
});

test('a missing tail of a surah keeps report ranges separate', () => {
  const tasks = [
    { id: 1, fromPage: 586, fromSurah: 81, fromAyah: 1, toPage: 586, toSurah: 81, toAyah: 20, toSurahAyahCount: 29, fromSurahName: 'التكوير', toSurahName: 'التكوير' },
    { id: 2, fromPage: 587, fromSurah: 82, fromAyah: 1, toPage: 587, toSurah: 82, toAyah: 10, toSurahAyahCount: 19, fromSurahName: 'الانفطار', toSurahName: 'الانفطار' },
  ];

  assert.equal(formatContinuousRecitationRange(tasks), 'من التكوير\u00a01 إلى 20، ثم من الانفطار\u00a01 إلى 10');
});

test('recitation pieces preserve reverse plan direction', () => {
  const tasks = [
    { id: 1, planDirection: -1, fromPage: 10, fromSurah: 2, fromAyah: 1 },
    { id: 2, planDirection: -1, fromPage: 9, fromSurah: 1, fromAyah: 1 },
  ];

  assert.deepEqual(sortRecitationTasks(tasks).map((task) => task.id), [1, 2]);
});

test('report recitation ranges use page numbers in page display mode', () => {
  const tasks = [
    { id: 1, fromPage: 1, toPage: 57 },
    { id: 2, fromPage: 58, toPage: 69 },
    { id: 3, fromPage: 70, toPage: 83 },
  ];

  assert.equal(formatContinuousRecitationRange(tasks, 'page'), 'من 1 إلى 83');
});

test('separate report page ranges remain visibly separate', () => {
  const tasks = [
    { id: 1, fromPage: 1, toPage: 10 },
    { id: 2, fromPage: 20, toPage: 20 },
  ];

  assert.equal(formatContinuousRecitationRange(tasks, 'page'), 'من 1 إلى 10، ثم الوجه 20');
});

test('page report ranges merge correctly for reverse plans', () => {
  const tasks = [
    { id: 1, planDirection: -1, fromPage: 10, toPage: 10 },
    { id: 2, planDirection: -1, fromPage: 9, toPage: 9 },
  ];

  assert.equal(formatContinuousRecitationRange(tasks, 'page'), 'من 9 إلى 10');
});
