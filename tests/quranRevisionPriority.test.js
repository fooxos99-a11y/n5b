import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { partitionQuranRevisionPages } from '../shared/quran-revision-priority.js';

test('linking pages are excluded from the continuous review rotation', () => {
  const result = partitionQuranRevisionPages({
    memorizedPages: Array.from({ length: 19 }, (_, index) => index + 1),
    currentMemorizationPage: 20,
    direction: 1,
    linkPages: 10,
  });

  assert.deepEqual(result.linking, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(result.review, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('linking uses the last saved faces before a new plan and leaves the rest for review', () => {
  const result = partitionQuranRevisionPages({
    memorizedPages: Array.from({ length: 30 }, (_, index) => index + 1),
    currentMemorizationPage: 31,
    direction: 1,
    linkPages: 10,
  });

  assert.deepEqual(result.linking, [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  assert.deepEqual(result.review, Array.from({ length: 20 }, (_, index) => index + 1));
});

test('review waits until memorized pages exceed the linking amount', () => {
  const result = partitionQuranRevisionPages({
    memorizedPages: [1, 2, 3, 4, 5],
    currentMemorizationPage: 6,
    linkPages: 10,
  });

  assert.deepEqual(result.linking, [1, 2, 3, 4, 5]);
  assert.deepEqual(result.review, []);
});

test('linking is limited to the faces the student has actually memorized', () => {
  const result = partitionQuranRevisionPages({
    memorizedPages: [11, 12],
    currentMemorizationPage: 13,
    linkPages: 20,
  });

  assert.deepEqual(result.linking, [11, 12]);
  assert.deepEqual(result.review, []);
});

test('linking priority follows reverse plans too', () => {
  const result = partitionQuranRevisionPages({
    memorizedPages: Array.from({ length: 19 }, (_, index) => 586 + index),
    currentMemorizationPage: 585,
    direction: -1,
    linkPages: 10,
  });

  assert.deepEqual(result.linking, [595, 594, 593, 592, 591, 590, 589, 588, 587, 586]);
  assert.deepEqual(result.review, [604, 603, 602, 601, 600, 599, 598, 597, 596]);
});

test('linking never jumps across a gap and all other saved pages remain review', () => {
  const memorizedPages = [
    ...Array.from({ length: 14 }, (_, index) => 235 + index),
    ...Array.from({ length: 50 }, (_, index) => 282 + index),
    ...Array.from({ length: 120 }, (_, index) => 342 + index),
    ...Array.from({ length: 85 }, (_, index) => 520 + index),
  ];
  const result = partitionQuranRevisionPages({
    memorizedPages,
    currentMemorizationPage: 271,
    direction: 1,
    linkPages: 20,
  });

  assert.deepEqual(result.linking, []);
  assert.deepEqual(result.review, memorizedPages);
});

test('unevaluated review tasks are rebuilt when they overlap the linking window', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

  assert.match(server, /repairUnevaluatedRevisionTasks/);
  assert.match(server, /getStudentMemorizedRanges\(connection, plan\.studentId, \{\s*beforeDate: date/);
  assert.match(server, /const allowedReviewSet = new Set\(allowedReviewPages\.map\(Number\)\)/);
  assert.match(server, /desiredLinkSet\.has\(page\) \|\| !allowedReviewSet\.has\(page\)/);
  assert.match(server, /repairedRevisionTasks\.removedReview/);
  assert.match(server, /SET next_review_page = \?/);
  assert.match(server, /reviewAmountChanged/);
  assert.match(server, /calculateWeeklyReviewDailyPages\(\{[\s\S]*availableReviewPages: revisionPages\.review\.length/);
  assert.match(server, /row\.studentStatus !== 'done'/);
});

test('stale student link tasks are rebuilt and cannot be executed outside accepted memorization', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

  assert.match(server, /safeToReplace[\s\S]*executionActorRole !== 'teacher'[\s\S]*!Number\(row\.hasAttempt\)/);
  assert.match(server, /removableIds = \[\.\.\.removableLinkRows, \.\.\.removableReviewRows\]/);
  assert.match(server, /isLinkTaskWithinAcceptedMemorization/);
  assert.match(server, /code: 'STALE_LINK_TASK'/);
});

test('linking uses exact memorized ayahs and does not wait for a full page', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

  assert.match(server, /async function buildExactLinkRanges/);
  assert.match(server, /await getStudentMemorizedRanges\(connection, plan\.studentId/);
  assert.match(server, /selectExactQuranLinkRanges\(\{ ayahs, ranges, current: currentMemorizationStart/);
  assert.match(server, /range\.startAyah/);
  assert.match(server, /range\.endAyah/);
  assert.match(server, /getQuranAyahsInPageRange\(connection, 1, 604\)/);
  assert.match(server, /acceptedMemorizationSql\(\)/);
});

test('linking walks backward in the plan traversal order instead of advancing into future verses', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const implementation = server.slice(
    server.indexOf('async function buildExactLinkRanges'),
    server.indexOf('async function advancePlanAfterCompletedMemorization'),
  );

  assert.match(implementation, /selectExactQuranLinkRanges/);
  const selector = await readFile(new URL('../server/services/quranLinkRanges.js', import.meta.url), 'utf8');
  assert.match(selector, /compare\(ayah, current, direction\) < 0/);
  assert.match(selector, /compare\(b, a, direction\)/);
  assert.doesNotMatch(implementation, /buildQuranRangeByFaceTarget\(connection, nearest, backwardLimit/);
});

test('review target records only the faces that are actually available', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

  assert.doesNotMatch(server, /overflowTargetPages/);
  assert.match(server, /'review',[\s\S]*range\.fromPage,[\s\S]*range\.toPage,[\s\S]*rangePages/);
});

test('editing a plan keeps its saved page boundaries visible even when already memorized', async () => {
  const plans = await readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8');

  assert.match(plans, /const currentPlanBoundaryPages = useMemo/);
  assert.match(plans, /currentPlanBoundaryPages\.has\(String\(page\)\) \|\| !pageInRanges/);
  assert.match(plans, /!currentPlanBoundaryPages\.has\(String\(current\.startPage\)\)/);
});
