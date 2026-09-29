import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getReviewStartForDate, reviewPagesMatch, reviewStartFromHistory } from '../server/services/quranReviewSchedule.js';

const done = (fromPage, toPage, taskDate = '2026-09-06') => ({
  fromPage, toPage, taskDate, studentStatus: 'done', teacherCompleted: null, executionState: 'complete',
});

test('review advances beyond the memorization plan end (Salman 526–560)', () => {
  assert.equal(reviewStartFromHistory([done(561, 570)], 526), 571);
});

test('prefilled future days never override the last completed review', async () => {
  const history = [done(561, 570), ...['07', '08', '09'].map((day) => ({
    ...done(561, 570, `2026-09-${day}`), studentStatus: 'pending',
  }))];
  const connection = { query: async (sql, values) => {
    assert.match(sql, /task_date < \?/);
    assert.deepEqual(values, [28, '2026-09-10']);
    return [history];
  } };
  assert.equal(await getReviewStartForDate(connection, { id: 28, startPage: 526, endPage: 560, nextReviewPage: 526 }, '2026-09-10'), 571);
});

test('an unfinished review remains required regardless of elapsed days', () => {
  const history = [done(561, 570), { ...done(571, 580, '2026-09-07'), studentStatus: 'pending' }];
  assert.equal(reviewStartFromHistory(history, 526), 571);
  assert.equal(reviewStartFromHistory([{ ...done(561, 570), studentStatus: 'pending' }], 526), 561);
});

test('teacher rejection overrides student completion and partial work retains the unfinished page', () => {
  assert.equal(reviewStartFromHistory([{ ...done(561, 570), teacherCompleted: 0 }], 526), 561);
  assert.equal(reviewStartFromHistory([{ ...done(561, 570), executionState: 'partial', actualToPage: 565 }], 526), 565);
  assert.equal(reviewStartFromHistory([{ ...done(561, 570), executionState: 'partial', actualToPage: 565, actualCompletesPage: true }], 526), 566);
  assert.equal(reviewStartFromHistory([{ ...done(561, 570), studentStatus: 'pending', teacherCompleted: 1 }], 526), 571);
});

test('partial review checks the last verse before advancing to the next page', async () => {
  const connection = { query: async (sql) => sql.includes('FROM quran_ayah_pages')
    ? [[{ surah: 2, ayah: 20 }]]
    : [[{ ...done(4, 6), executionState: 'partial', actualToPage: 5, actualToSurah: 2, actualToAyah: 20 }]],
  };
  assert.equal(await getReviewStartForDate(connection, { id: 1, startPage: 4 }, '2026-09-07'), 6);
});

test('teacher approval of a partial review never skips its unfinished pages', async () => {
  for (const [actualToAyah, expected] of [[19, 4], [20, 5]]) {
    const connection = { query: async (sql) => sql.includes('FROM quran_ayah_pages')
      ? [[{ surah: 2, ayah: 20 }]]
      : [[{ ...done(2, 6), teacherCompleted: 1, executionState: 'partial', actualToPage: 4, actualToSurah: 2, actualToAyah }]],
    };
    assert.equal(await getReviewStartForDate(connection, { id: 1, startPage: 22 }, '2026-09-07'), expected);
  }
});

test('rotation wraps over disjoint memorized ranges without forgetting the lower segment', () => {
  assert.equal(reviewStartFromHistory([
    done(590, 599, '2026-09-05'), done(600, 604), done(518, 522),
  ], 526), 523);
});

test('review range reconciliation detects a stale range even when its amount matches', () => {
  assert.equal(reviewPagesMatch([{ fromPage: 561, toPage: 570 }], Array.from({ length: 10 }, (_, i) => 571 + i)), false);
  assert.equal(reviewPagesMatch([{ fromPage: 571, toPage: 575 }, { fromPage: 576, toPage: 580 }], Array.from({ length: 10 }, (_, i) => 571 + i)), true);
});

test('the actual repair removes only untouched stale reviews and never changes historical or recorded work', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = source.slice(source.indexOf('async function repairUnevaluatedRevisionTasks('), source.indexOf('function pickAvailablePages('));
  const repair = new Function('getSaudiDateTimeParts', 'reviewPagesMatch', `${implementation}; return repairUnevaluatedRevisionTasks;`)(
    () => ({ date: '2026-09-07' }), reviewPagesMatch,
  );
  const desired = Array.from({ length: 10 }, (_, i) => 571 + i);
  const base = { id: 1, taskType: 'review', fromPage: 561, toPage: 570, studentStatus: 'pending', teacherCompleted: null };
  for (const [changes, removable] of [
    [{}, true], [{ studentStatus: 'done' }, false], [{ teacherCompleted: 0 }, false],
    [{ teacherCompleted: 1 }, false], [{ executedAt: '2026-09-07 10:00:00' }, false],
    [{ actualToPage: 565 }, false], [{ evaluatedAt: '2026-09-07 10:00:00' }, false],
    [{ executionActorRole: 'student', studentStatus: 'not_done' }, false], [{ hasAttempt: 1 }, false],
  ]) {
    const deletes = [];
    const connection = { query: async (sql, values) => {
      if (sql.startsWith('DELETE')) { deletes.push(values); return [{}]; }
      return [[{ ...base, ...changes }]];
    } };
    const result = await repair(connection, { planId: 28, date: '2026-09-07', desiredLinkPages: [], allowedReviewPages: [...desired, ...Array.from({ length: 10 }, (_, i) => 561 + i)], desiredReviewPageCount: 10, desiredReviewPages: desired });
    assert.equal(result.removedReview, removable, JSON.stringify(changes));
    assert.equal(deletes.length, removable ? 1 : 0);
  }
  await repair({ query: () => assert.fail('Historical tasks must remain unchanged') }, { planId: 28, date: '2026-09-06', desiredLinkPages: [], allowedReviewPages: [], desiredReviewPageCount: 10, desiredReviewPages: desired });
});
