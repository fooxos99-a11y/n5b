import assert from 'node:assert/strict';
import test from 'node:test';
import { hizbOfPage, pickReviewPagesByHizbs, splitPageRangesByHizb, HIZB_START_PAGES } from '../shared/quran-hizbs.js';
import { applyOfflineReviewGroupOutcome, evaluateRecitationGroup } from '../src/lib/recitationGroupGrade.js';
import { DEFAULT_GRADING_POLICY } from '../shared/grading-policy.js';

const allPages = new Set(Array.from({ length: 604 }, (_, index) => index + 1));

test('pages map to the hizb that starts on or before them', () => {
  assert.equal(HIZB_START_PAGES.length, 60);
  assert.equal(hizbOfPage(1), 1);
  assert.equal(hizbOfPage(10), 1);
  assert.equal(hizbOfPage(11), 2);
  assert.equal(hizbOfPage(604), 60);
});

test('review picks whole ahzab by count and continues from the next page', () => {
  const two = pickReviewPagesByHizbs(allPages, 1, 2);
  assert.deepEqual([two.pages[0], two.pages.at(-1), two.nextReviewPage], [1, 21, 22]);
  assert.deepEqual(two.hizbs, [1, 2]);
  const five = pickReviewPagesByHizbs(allPages, 22, 5);
  assert.deepEqual(five.hizbs, [3, 4, 5, 6, 7]);
  assert.deepEqual(pickReviewPagesByHizbs(new Set(), 1, 2).pages, []);
});

test('review ranges are split so every task belongs to one hizb', () => {
  assert.deepEqual(splitPageRangesByHizb([{ fromPage: 5, toPage: 25 }]), [
    { fromPage: 5, toPage: 10, hizb: 1 },
    { fromPage: 11, toPage: 21, hizb: 2 },
    { fromPage: 22, toPage: 25, hizb: 3 },
  ]);
});

test('live evaluation fails memorization by a single face and review by a single hizb', () => {
  const memorization = evaluateRecitationGroup(DEFAULT_GRADING_POLICY, 'memorization',
    [{ id: 1 }, { id: 2 }], { 1: { warningCount: 4, mistakeCount: 0 }, 2: { warningCount: 0, mistakeCount: 0 } });
  assert.equal(memorization.result.passed, false);
  assert.equal(memorization.failedLabel, 'الوجه 1');
  assert.equal(memorization.itemResults.get('1').failed, true);
  const passing = evaluateRecitationGroup(DEFAULT_GRADING_POLICY, 'memorization',
    [{ id: 1 }, { id: 2 }], { 1: { warningCount: 2 }, 2: { warningCount: 2 } });
  assert.equal(passing.result.passed, true);
  assert.equal(passing.result.rawScore, 0.96);
  const review = evaluateRecitationGroup(DEFAULT_GRADING_POLICY, 'review',
    [{ id: 'a', fromPage: 1 }, { id: 'b', fromPage: 5 }, { id: 'c', fromPage: 11 }],
    { a: { mistakeCount: 2 }, b: { mistakeCount: 1, warningCount: 1 }, c: {} });
  assert.equal(review.result.passed, false);
  assert.equal(review.failedLabel, 'الحزب 1');
  assert.equal(review.itemResults.get('b').failed, true);
  assert.equal(review.itemResults.get('c').failed, true);
});

test('review accumulates split ranges within one hizb and permits its exact cap', () => {
  const review = evaluateRecitationGroup(DEFAULT_GRADING_POLICY, 'review',
    [{ id: 'a', fromPage: 1 }, { id: 'b', fromPage: 5 }, { id: 'c', fromPage: 11 }],
    { a: { mistakeCount: 2 }, b: { mistakeCount: 1 }, c: { warningCount: 15 } });
  assert.equal(review.result.hizbCount, 2);
  assert.equal(review.result.passed, true);
  assert.equal(review.result.grade, 0.7);
});

test('offline review fails the whole amount, preserves counts and isolates compensation groups', () => {
  const entries = [1, 2, 3, 4, 5].map((id) => ({
    task: { id, planId: 1, taskDate: '2026-10-13', taskType: 'review', hizbNumber: id, compensationIndex: id === 5 ? 1 : 0 },
    payload: { offlineOutcome: { warningCount: id === 1 ? 16 : 2, mistakeCount: 0, hesitationCount: 0, completed: id !== 1, score: 98 } },
  }));
  const result = applyOfflineReviewGroupOutcome(entries, DEFAULT_GRADING_POLICY);
  assert.deepEqual(result.map(({ payload }) => payload.offlineOutcome.completed), [false, false, false, false, true]);
  assert.deepEqual(result.map(({ payload }) => payload.offlineOutcome.warningCount), [16, 2, 2, 2, 2]);
  assert.equal(entries[1].payload.offlineOutcome.completed, true, 'input remains unchanged');
  assert.equal(applyOfflineReviewGroupOutcome(entries, null), entries);
  const manual = entries.map((entry) => ({ ...entry, payload: { ...entry.payload, notMemorized: entry.task.id === 2,
    offlineOutcome: { ...entry.payload.offlineOutcome, warningCount: 0 } } }));
  assert.deepEqual(applyOfflineReviewGroupOutcome(manual, DEFAULT_GRADING_POLICY).map(({ payload }) => payload.offlineOutcome.completed), [false, false, false, false, true]);
});
