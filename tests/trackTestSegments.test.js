import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGradingPolicy, trackSegmentDefinitions, gradingMaxima, gradingPolicyErrors } from '../shared/grading-policy.js';
import { evaluateTrackSession } from '../shared/grading-engine.js';
import { createTrackTestAttempts, trackRangeCandidates } from '../server/services/trackTestSegments.js';

const policy = normalizeGradingPolicy({ trackSession: { segments: [{ source: 'link', max: 3 }, { source: 'review', max: 7 }, { source: 'link', max: 4 }] } });
const auth = { role: 'manager', id: 1, tokenHash: 'test-session' };
const context = { studentId: 3, weekStart: '2026-09-27', today: '2026-10-02', policy, auth };
const ayahs = Array.from({ length: 8 }, (_, index) => ({ surah: 2, ayah: index + 1, page: Math.floor(index / 2) + 2, surahName: 'البقرة' }));
const task = (source, fromAyah = 1, toAyah = 8, date = context.today) => ({ source, fromSurah: 2, fromAyah, toSurah: 2, toAyah, date });
const connection = tasks => ({ async query(sql, values) {
  if (sql.includes('FROM student_quran_tasks')) { assert.deepEqual(values, [3, '2026-09-27', '2026-10-02']); return [tasks]; }
  if (sql.includes('FROM quran_ayah_pages')) return [ayahs.map(row => ({ ...row, juz: 1 }))];
  throw new Error(`Unexpected query: ${sql}`);
} });

test('individual segment types and weights affect grading; old frozen rules remain equivalent', () => {
  assert.equal(policy.trackSession.segmentCount, 3);
  assert.equal(gradingMaxima(policy).trackSession, 24);
  const result = evaluateTrackSession(policy, { attended: true, segments: [{ warnings: 1, max: 100 }, { mistakes: 1 }, { recorded: false }] });
  assert.deepEqual(result.segments.map(row => [row.source, row.max, row.grade]), [['link', 3, 2], ['review', 7, 2], ['link', 4, 0]]);
  assert.equal(result.grade, 14);
  assert.equal(evaluateTrackSession({ trackSession: { segmentCount: 3, segmentMax: 2 } }, { attended: true }).grade, 16);
  assert.deepEqual(trackSegmentDefinitions({ trackSession: { segmentCount: 0 } }), []);
  assert.equal(gradingMaxima({ trackSession: { segments: [] } }).trackSession, 10);
});

test('policy validation rejects invalid sources, weights, limits and totals before normalization', () => {
  for (const segments of [[{ source: 'memorization', max: 1 }], [{ source: 'link', max: -1 }], [{ source: 'review', max: '' }], Array(21).fill({ source: 'link', max: 0 }), {}]) {
    assert.ok(Object.keys(gradingPolicyErrors({ trackSession: { segments } })).length);
  }
  assert.ok(gradingPolicyErrors({ trackSession: { segments: [{ source: 'link', max: 100 }] } }).total);
  assert.deepEqual(gradingPolicyErrors(policy), {});
});

test('random pools respect exact verse bounds, split pages, and keep gaps separate', () => {
  const candidates = trackRangeCandidates(ayahs, [task('link', 2, 2), task('link', 4, 5), task('link', 8, 8)]);
  assert.deepEqual(candidates.map(range => [range.fromAyah, range.toAyah]), [[2, 2], [4, 4], [5, 5], [8, 8]]);
});

test('attempt selects latest assigned amounts with no repeats before pool exhaustion and signs the ranges', async () => {
  let now = 1;
  const attempts = createTrackTestAttempts({ now: () => now, pick: () => 0 });
  const prepared = await attempts.prepare(connection([task('link', 3, 8), task('review', 1, 2), task('link', 1, 8, '2026-09-28')]), context);
  assert.deepEqual(prepared.segments.map(row => [row.source, row.range.fromAyah]), [['link', 3], ['review', 1], ['link', 5]]);
  const submitted = prepared.segments.map(row => ({ ...row, recorded: true, mistakes: 0, warnings: 1 }));
  const save = { ...context, segments: submitted };
  assert.equal(attempts.verify(prepared.attemptToken, save).length, 3);
  for (const changed of [{ studentId: 4 }, { weekStart: '2026-09-20' }, { auth: { ...auth, tokenHash: 'other' } }, { policy: normalizeGradingPolicy() }, { segments: submitted.slice(1) },
    { segments: submitted.map((row, index) => index ? row : { ...row, range: { ...row.range, fromAyah: 1 } }) }]) {
    assert.throws(() => attempts.verify(prepared.attemptToken, { ...save, ...changed }), { status: 422 });
  }
  assert.throws(() => attempts.verify(`${prepared.attemptToken}x`, save), { status: 422 });
  now = 2 * 60 * 60 * 1000 + 1;
  assert.throws(() => attempts.verify(prepared.attemptToken, save), { status: 422 });
});

test('missing review amount fails clearly, and future assigned tasks are excluded by the query', async () => {
  await assert.rejects(createTrackTestAttempts().prepare(connection([task('link')]), context), /لا يوجد مقدار مراجعة/);
});

test('replacement keeps other ranges and weights, excludes current and sibling, and signs the new selection', async () => {
  const attempts = createTrackTestAttempts({ pick: () => 0 });
  const db = connection([task('link'), task('review')]);
  const original = await attempts.prepare(db, context);
  const changed = await attempts.prepare(db, { ...context, attemptToken: original.attemptToken, segmentIndex: 0 });
  assert.equal(changed.segments[0].range.fromAyah, 5);
  assert.deepEqual(changed.segments.slice(1), original.segments.slice(1));
  assert.equal(changed.segments[0].source, 'link');
  assert.equal(changed.segments[0].max, 3);
  const segments = changed.segments.map((item, index) => ({ ...item, recorded: true, mistakes: index, warnings: 2, hesitations: 3 }));
  assert.deepEqual(attempts.verify(changed.attemptToken, { ...context, segments }), segments);
  assert.throws(() => attempts.verify(original.attemptToken, { ...context, segments }), { status: 422 });
  const review = await attempts.prepare(db, { ...context, attemptToken: changed.attemptToken, segmentIndex: 1 });
  assert.notDeepEqual(review.segments[1].range, changed.segments[1].range);
  assert.deepEqual(review.segments[0], changed.segments[0]);
  for (const patch of [{ studentId: 4 }, { weekStart: '2026-09-20' }, { auth: { ...auth, tokenHash: 'other' } },
    { policy: normalizeGradingPolicy() }, { attemptToken: `${original.attemptToken}x` }, { attemptToken: null },
    { segmentIndex: -1 }, { segmentIndex: 3 }, { segmentIndex: '0' }, { segmentIndex: 0.5 }, { segmentIndex: undefined }]) {
    await assert.rejects(attempts.prepare(db, { ...context, attemptToken: original.attemptToken, segmentIndex: 0, ...patch }), { status: 422 });
  }
});

test('replacement unavailable when all candidates are in use; rejects expired attempts and removed amounts', async () => {
  let now = 0;
  const attempts = createTrackTestAttempts({ now: () => now, pick: () => 0 });
  const db = connection([task('link', 1, 4), task('review', 5, 6)]);
  const original = await attempts.prepare(db, context);
  assert.ok(original.segments.every(item => item.canReplace === false));
  for (const segmentIndex of [0, 1, 2]) {
    await assert.rejects(attempts.prepare(db, { ...context, attemptToken: original.attemptToken, segmentIndex }), /لا يوجد مقطع آخر/);
  }
  await assert.rejects(attempts.prepare(connection([task('link')]), { ...context, attemptToken: original.attemptToken, segmentIndex: 1 }), /لا يوجد مقطع آخر/);
  now = 2 * 60 * 60 * 1000;
  await assert.rejects(attempts.prepare(db, { ...context, attemptToken: original.attemptToken, segmentIndex: 0 }), { status: 422 });
});
