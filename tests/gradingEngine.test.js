import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PLAN_READING_FACES } from '../shared/quran-plan-options.js';
import {
  DEFAULT_GRADING_POLICY,
  gradingMaxima,
  memorizationThresholdFor,
  normalizeGradingPolicy,
  reviewAmountThreshold,
} from '../shared/grading-policy.js';
import {
  averageWeeklyTotals,
  computeWeeklyGrade,
  evaluateAttendance,
  evaluateLink,
  evaluateMemorization,
  evaluateReading,
  evaluateReview,
  evaluateTrackSession,
  evaluateWeeklySession,
  facesReadStatistics,
} from '../shared/grading-engine.js';
import { HIZB_COUNT, groupAyahsByHizb, hizbOfAyah } from '../shared/quran-hizbs.js';

const policy = normalizeGradingPolicy();

test('default distribution adds up to 100 and every part is derived from the policy', () => {
  const maxima = gradingMaxima(policy);
  assert.deepEqual(maxima.programParts, { attendance: 5, memorization: 5, link: 5, review: 5, reading: 7, margin: 3 });
  assert.equal(maxima.weeklyProgram, 30);
  assert.equal(maxima.trackSession, 30);
  assert.equal(maxima.weeklySession, 20);
  assert.equal(maxima.generalMargin, 20);
  assert.equal(maxima.total, 100);
  const changed = gradingMaxima({ ...DEFAULT_GRADING_POLICY, generalMargin: 10, weeklySession: { attendance: 30 } });
  assert.equal(changed.total, 100);
  assert.equal(gradingMaxima({ weeklyProgram: { margin: 5 } }).weeklyProgram, 32);
});

test('invalid settings fall back to defaults and the one-face threshold always exists', () => {
  const normalized = normalizeGradingPolicy({ weeklyProgram: { mistakeDeduction: 'x', workDays: [9], memorizationThresholds: [{ faces: 3, threshold: 0.9 }] } });
  assert.equal(normalized.weeklyProgram.mistakeDeduction, 0.05);
  assert.deepEqual(normalized.weeklyProgram.workDays, [0, 1, 2, 3, 4]);
  assert.deepEqual(normalized.weeklyProgram.memorizationThresholds, [{ faces: 1, threshold: 0.97 }, { faces: 3, threshold: 0.9 }]);
});

test('attendance values: present, late, excused, absent', () => {
  assert.equal(evaluateAttendance(policy, 'present').grade, 1);
  assert.equal(evaluateAttendance(policy, 'late').grade, 0.5);
  assert.equal(evaluateAttendance(policy, 'excused').grade, 0.25);
  assert.equal(evaluateAttendance(policy, 'absent').grade, 0);
  assert.equal(evaluateAttendance(policy, 'unknown').grade, 0);
});

test('deductions: 3 mistakes and 15 warnings both deduct 0.15', () => {
  assert.equal(evaluateLink(policy, { mistakes: 3 }).totalDeduction, 0.15);
  assert.equal(evaluateLink(policy, { warnings: 15 }).totalDeduction, 0.15);
});

test('one face: 0.98 passes, 0.97 and 0.96 fail', () => {
  assert.equal(evaluateMemorization(policy, { faces: [{ warnings: 2 }] }).passed, true);
  assert.equal(evaluateMemorization(policy, { faces: [{ warnings: 2 }] }).grade, 0.98);
  const atThreshold = evaluateMemorization(policy, { faces: [{ warnings: 3 }] });
  assert.equal(atThreshold.passed, false);
  assert.equal(atThreshold.grade, 0);
  assert.equal(atThreshold.repeatRequired, true);
  assert.equal(evaluateMemorization(policy, { faces: [{ warnings: 4 }] }).passed, false);
});

test('two faces with two warnings each: every face 0.98, total 0.96 > 0.95 passes', () => {
  const result = evaluateMemorization(policy, { faces: [{ warnings: 2 }, { warnings: 2 }] });
  assert.deepEqual(result.faces.map(face => face.score), [0.98, 0.98]);
  assert.equal(result.rawScore, 0.96);
  assert.equal(result.amountThreshold, 0.95);
  assert.equal(result.passed, true);
  assert.equal(result.grade, 0.96);
  assert.equal(result.repeatRequired, false);
});

test('two faces: a single face at 0.96 fails the whole memorization even if the total is above 0.95', () => {
  const result = evaluateMemorization(policy, { faces: [{ warnings: 4 }, {}] });
  assert.equal(result.rawScore, 0.96);
  assert.equal(result.passed, false);
  assert.equal(result.failType, 'face');
  assert.equal(result.failedFaceIndex, 1);
  assert.equal(result.grade, 0);
  assert.equal(result.repeatRequired, true);
});

test('two faces reaching the amount threshold fail; manual fail always wins', () => {
  const failedTotal = evaluateMemorization({ ...policy, weeklyProgram: { ...policy.weeklyProgram, memorizationThresholds: [{ faces: 1, threshold: 0.97 }, { faces: 2, threshold: 0.96 }] } }, { faces: [{ warnings: 2 }, { warnings: 2 }] });
  assert.equal(failedTotal.failType, 'amount');
  assert.equal(failedTotal.grade, 0);
  const manual = evaluateMemorization(policy, { faces: [{}], manualFail: true });
  assert.equal(manual.failType, 'manual');
  assert.equal(manual.failReason, 'رسوب يدوي');
  assert.equal(manual.grade, 0);
});

test('memorization thresholds use the exact face count, otherwise the closest smaller configured count', () => {
  const custom = { weeklyProgram: { memorizationThresholds: [{ faces: 1, threshold: 0.97 }, { faces: 2, threshold: 0.95 }, { faces: 4, threshold: 0.9 }] } };
  assert.equal(memorizationThresholdFor(custom, 1), 0.97);
  assert.equal(memorizationThresholdFor(custom, 3), 0.95);
  assert.equal(memorizationThresholdFor(custom, 4), 0.9);
  assert.equal(memorizationThresholdFor(custom, 9), 0.9);
});

test('link: 0.86 passes, 0.85 fails, manual fail is zero', () => {
  const pass = evaluateLink(policy, { mistakes: 2, warnings: 4 });
  assert.equal(pass.rawScore, 0.86);
  assert.equal(pass.passed, true);
  assert.equal(pass.grade, 0.86);
  const fail = evaluateLink(policy, { mistakes: 2, warnings: 5 });
  assert.equal(fail.rawScore, 0.85);
  assert.equal(fail.passed, false);
  assert.equal(fail.grade, 0);
  assert.equal(evaluateLink(policy, { manualFail: true }).failReason, 'رسوب يدوي');
});

test('review threshold is computed from the number of ahzab', () => {
  assert.equal(reviewAmountThreshold(policy, 1), 0.85);
  assert.equal(reviewAmountThreshold(policy, 2), 0.7);
  assert.equal(reviewAmountThreshold(policy, 3), 0.55);
  assert.equal(reviewAmountThreshold(policy, 4), 0.4);
});

test('review: any hizb reaching 0.15 fails the whole review', () => {
  for (const hizb of [{ mistakes: 3 }, { warnings: 15 }, { mistakes: 2, warnings: 5 }]) {
    assert.equal(evaluateReview(policy, { hizbs: [hizb] }).passed, false);
  }
  const result = evaluateReview(policy, { hizbs: [{ mistakes: 2 }, { mistakes: 1, warnings: 3 }, { mistakes: 3 }, { warnings: 2 }] });
  assert.equal(result.failType, 'hizb');
  assert.equal(result.failedHizbIndex, 3);
  assert.equal(result.grade, 0);
});

test('review passes with partial deductions below every limit', () => {
  const result = evaluateReview(policy, { hizbs: [{ mistakes: 2 }, { mistakes: 1, warnings: 3 }, { warnings: 2 }, { warnings: 2 }] });
  assert.equal(result.totalDeduction, 0.22);
  assert.equal(result.amountThreshold, 0.4);
  assert.equal(result.passed, true);
  assert.equal(result.grade, 0.78);
  assert.equal(evaluateReview(policy, { hizbs: [{}], manualFail: true }).grade, 0);
});

test('self reading is completion only', () => {
  assert.equal(evaluateReading(policy, { completed: true }).grade, 1);
  assert.equal(evaluateReading(policy, { completed: true, requiredFaces: 7.5, expectedFaces: 10 }).grade, 0.75);
  assert.equal(evaluateReading(policy, { completed: true, requiredFaces: 15, expectedFaces: 10 }).grade, 1);
  assert.equal(evaluateReading(policy, { completed: false }).grade, 0);
  assert.equal(evaluateReading(policy, {}).requiredFaces, DEFAULT_PLAN_READING_FACES);
  assert.equal(evaluateReading(policy, { requiredFaces: 30 }).requiredFaces, 30);
});

test('track session: segment deductions never go below zero', () => {
  const result = evaluateTrackSession(policy, { attended: true, segments: [{ mistakes: 1 }, { mistakes: 1, warnings: 4 }] });
  assert.deepEqual(result.segments.map(item => item.grade), [5, 1]);
  assert.equal(result.grade, 16);
  assert.equal(evaluateTrackSession(policy, { attended: true, segments: [{ mistakes: 2 }, { mistakes: 5 }] }).grade, 10);
  assert.equal(evaluateTrackSession(policy, { attended: false, segments: [{}, {}] }).grade, 0);
  assert.equal(evaluateTrackSession(policy, { attended: true, segments: [{}, {}] }).grade, 30);
});

test('weekly session is attendance only', () => {
  assert.equal(evaluateWeeklySession(policy, { attended: true }).grade, 20);
  assert.equal(evaluateWeeklySession(policy, { attended: false }).grade, 0);
});

const fullDay = (weekday) => ({
  date: `2026-09-${20 + weekday}`,
  weekday,
  planActive: true,
  attendance: { grade: weekday <= 4 ? 1 : 0 },
  memorization: { grade: 1, scheduled: true },
  link: { grade: 1, scheduled: true },
  review: { grade: 1, scheduled: true },
  reading: { grade: 1 },
});

test('a perfect week is 100 and an empty week keeps both margins', () => {
  const days = [0, 1, 2, 3, 4, 5, 6].map(fullDay);
  assert.equal(computeWeeklyGrade(policy, { days, track: { grade: 30 }, weekly: { grade: 20 } }).total, 100);
  const empty = computeWeeklyGrade(policy, { days: [] });
  assert.equal(empty.weeklyProgram.grade, 3);
  assert.equal(empty.total, 23);
});

test('components with no scheduled task for an active plan get full credit when configured', () => {
  const day = { date: '2026-09-20', weekday: 0, planActive: true, attendance: { grade: 1 }, memorization: { grade: 1, scheduled: true }, link: { scheduled: false }, review: { scheduled: false } };
  assert.equal(computeWeeklyGrade(policy, { days: [day] }).parts.link, 1);
  assert.equal(computeWeeklyGrade({ ...policy, notApplicableCredit: 'none' }, { days: [day] }).parts.link, 0);
  assert.equal(computeWeeklyGrade(policy, { days: [{ ...day, planActive: false }] }).parts.link, 0);
});

test('term average is the mean of weekly percentages', () => {
  assert.deepEqual(averageWeeklyTotals([{ total: 100, max: 100 }, { total: 80, max: 100 }]), { weeks: 2, averagePercent: 90 });
  assert.equal(averageWeeklyTotals([]), null);
});

test('faces read count every recited face once plus the configured repetitions', () => {
  assert.deepEqual(facesReadStatistics(policy, { memorizationFaces: 1, linkFaces: 10, reviewFaces: 20, readingFaces: 10 }), {
    memorization: 41, link: 10, review: 20, reading: 10, total: 81,
  });
});

test('ahzab: 60 units, lookups and grouping by hizb', () => {
  assert.equal(HIZB_COUNT, 60);
  assert.equal(hizbOfAyah(1, 1), 1);
  assert.equal(hizbOfAyah(2, 74), 1);
  assert.equal(hizbOfAyah(2, 75), 2);
  assert.equal(hizbOfAyah(114, 6), 60);
  const groups = groupAyahsByHizb([{ surah: 2, ayah: 73 }, { surah: 2, ayah: 74 }, { surah: 2, ayah: 75 }]);
  assert.deepEqual(groups.map(group => [group.hizb, group.ayahs.length]), [[1, 2], [2, 1]]);
});

test('track session: attendance before the test counts only attendance until segments are recorded', () => {
  const pending = evaluateTrackSession(policy, { attended: true, segments: [{ recorded: false }, { recorded: false }] });
  assert.equal(pending.grade, policy.trackSession.attendance);
  assert.deepEqual(pending.segments.map(item => item.recorded), [false, false]);
  const tested = evaluateTrackSession(policy, { attended: true, segments: [{ mistakes: 1, recorded: true }, { recorded: true }] });
  assert.deepEqual(tested.segments.map(item => item.recorded), [true, true]);
});
