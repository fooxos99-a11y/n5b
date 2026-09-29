import assert from 'node:assert/strict';
import test from 'node:test';
import { hizbOfPage, pickReviewPagesByHizbs, splitPageRangesByHizb, HIZB_START_PAGES } from '../shared/quran-hizbs.js';
import { evaluateRecitationGroup } from '../src/lib/recitationGroupGrade.js';
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
    { a: { mistakeCount: 2 }, b: { mistakeCount: 1 }, c: {} });
  assert.equal(review.result.passed, false);
  assert.equal(review.failedLabel, 'الحزب 1');
  assert.equal(review.itemResults.get('b').failed, true);
});
