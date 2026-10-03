import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canStudentExecuteQuranTask,
  canStudentSetQuranTaskEnd,
  canTeacherExecuteQuranTask,
  compareQuranPositionInDirection,
  getQuranTaskExecutionSource,
  orderQuranRangesBeforePosition,
} from '../shared/quran-execution-policy.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reverse-surah plans keep ayahs ascending inside each surah', () => {
  const start = { page: 521, surah: 51, ayah: 7 };
  const end = { page: 521, surah: 51, ayah: 30 };
  const nextSurah = { page: 518, surah: 50, ayah: 1 };
  assert.ok(compareQuranPositionInDirection(end, start, -1) > 0);
  assert.ok(compareQuranPositionInDirection(nextSurah, end, -1) > 0);
});

test('reverse-surah linking selects yesterday within the same surah and excludes future lower surahs', () => {
  const ranges = [
    {
      id: 'yesterday',
      startPage: 520,
      startSurah: 51,
      startAyah: 1,
      endPage: 520,
      endSurah: 51,
      endAyah: 6,
    },
    {
      id: 'future-saved',
      startPage: 517,
      startSurah: 49,
      startAyah: 12,
      endPage: 519,
      endSurah: 50,
      endAyah: 35,
    },
  ];

  const ordered = orderQuranRangesBeforePosition(
    ranges,
    { page: 521, surah: 51, ayah: 7 },
    -1,
  );

  assert.deepEqual(ordered.map(({ range }) => range.id), ['yesterday']);
  assert.deepEqual(ordered[0].traversalEnd, { page: 520, surah: 51, ayah: 6 });
});

test('students never execute Quran tasks: the teacher executes every task whatever the stored settings say', () => {
  const settings = {
    memorizationExecutionSource: 'student',
    reviewExecutionSource: 'student',
    linkExecutionSource: 'teacher',
    repeatExecutionSource: 'both',
  };
  for (const taskType of ['memorization', 'review', 'link', 'repeat']) {
    assert.equal(getQuranTaskExecutionSource(settings, taskType), 'teacher');
    assert.equal(canStudentExecuteQuranTask(settings, taskType), false);
    assert.equal(canTeacherExecuteQuranTask(settings, taskType), true);
  }
});

test('memorization defaults to teacher execution for backward compatibility', () => {
  assert.equal(getQuranTaskExecutionSource({}, 'memorization'), 'teacher');
  assert.equal(canStudentExecuteQuranTask({}, 'memorization'), false);
  assert.equal(canTeacherExecuteQuranTask({}, 'memorization'), true);
});

test('memorization reduction, compensation, and forward increase are independent permissions', () => {
  const fixed = {
    studentTaskAmountEditable: false,
    allowQuranCompensation: false,
    allowQuranExtra: false,
  };
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', -1), false);
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', 0), true);
  assert.equal(canStudentSetQuranTaskEnd(fixed, 'memorization', 1), false);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, studentTaskAmountEditable: true }, 'memorization', -1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true }, 'memorization', -1), false);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true }, 'memorization', 1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranExtra: true }, 'memorization', 1), true);
  assert.equal(canStudentSetQuranTaskEnd({ ...fixed, allowQuranCompensation: true, studentReviewAmountEditable: false }, 'review', 1), false);
});

test('execution ownership and configured count limits are enforced on the server', async () => {
  const [server, migration, selector] = await Promise.all([
    read('../server/index.js'),
    read('../server/migrations/2026.08.25.7-quran-execution-ownership.js'),
    read('../src/components/portal/RepeatCountSelector.jsx'),
  ]);
  assert.match(migration, /execution_actor_role/);
  assert.match(server, /سبق أن اعتمد مشرف المسار تنفيذ هذه المهمة/);
  assert.match(server, /execution_actor_role = 'student'/);
  assert.match(server, /execution_actor_role = 'teacher'/);
  assert.match(server, /settings\.allowRepeatCountEditing\) \{\s*return practiceCompletionCount\(req\.body\.repeatCount/);
  assert.match(server, /settings\.allowListeningCountEditing\) \{\s*return practiceCompletionCount\(req\.body\.listeningCount/);
  assert.match(server, /practiceCompletionCount\(req\.body\.repeatCount, expectedRepeatCount\)/);
  assert.match(server, /practiceCompletionCount\(req\.body\.listeningCount, expectedListeningCount\)/);
  assert.match(server, /const QURAN_EXTRA_FORWARD_FACES = 50/);
  assert.match(server, /allowRepeatCountEditing: settings\.allowRepeatCountEditing[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(selector, /ListeningChoice[\s\S]*disabled=\{!editable\}/);
});

test('evaluation policy and compensation settings use the local configuration', async () => {
  const server = await read('../server/index.js');
  assert.match(server, /gradingPolicy: await loadGradingPolicyForDate\(db\(\), date, \{ freeze: false \}\)/);
  assert.match(server, /allowQuranCompensation: settings\.allowQuranCompensation !== 'false'/);
  assert.match(server, /allowQuranExtra: settings\.allowQuranExtra === 'true'/);
  assert.match(server, /canTeacherExecuteQuranTask\(settings, task\.taskType\)/);
  assert.match(server, /teacher_completed = \?[\s\S]*evaluated_by = \?/);
  assert.doesNotMatch(server, /nazem/i);
});

test('review and link cannot extend beyond their assigned range and evaluations award no task rewards', async () => {
  const server = await read('../server/index.js');
  assert.match(server, /first\.taskType === 'link'\) \{\s*allowedEnd = expectedEnd;/);
  assert.doesNotMatch(server, /repeatReward|targetPoints|saveEvaluatedGroupRewards/);
  assert.match(server, /t\.task_type = 'review' AND \$\{acceptedQuranExecutionSql\('t'\)\}/);
  assert.match(server, /Math\.min\(100, Math\.round\(\(achievedFaces \/ expectedFaces\) \* 100\)\)/);
});

test('link amount cannot change even with legacy permission enabled', () => {
 for (const comparison of [-1, 1]) assert.equal(canStudentSetQuranTaskEnd({ studentLinkAmountEditable: true }, 'link', comparison), false);
 assert.equal(canStudentSetQuranTaskEnd({}, 'link', 0), true);
});
