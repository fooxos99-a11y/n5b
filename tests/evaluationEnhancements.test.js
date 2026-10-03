import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { normalizeGradingPolicy, gradingPolicyErrors } from '../shared/grading-policy.js';
import { evaluateMemorization, evaluateReview, evaluateLink, evaluateTrackSession } from '../shared/grading-engine.js';
import { normalizeSelectedWordMarks, normalizeSelectedAyahMarks } from '../server/services/recitationMarks.js';
import { resolveMemorizedReading } from '../server/services/selfReadingAmount.js';
import { evaluateRecitationGroup } from '../src/lib/recitationGroupGrade.js';
import layout from '../server/data/quranVerseLineLayout.js';

const ayahs = layout.map(([key, page]) => {
  const [surah, ayah] = key.split(':').map(Number);
  return { surah, ayah, page };
});

test('hesitation defaults to zero deduction, remains counted and uses an independently editable policy', () => {
  const old = normalizeGradingPolicy({ weeklyProgram: { mistakeDeduction: 0.05 } });
  assert.equal(old.weeklyProgram.hesitationDeduction, 0);
  assert.equal(old.trackSession.hesitationDeduction, 0);
  for (const invalid of [-1, Infinity, 'bad', null, '']) {
    assert.ok(gradingPolicyErrors({weeklyProgram:{hesitationDeduction:invalid}})['weeklyProgram.hesitationDeduction']);
    assert.ok(gradingPolicyErrors({trackSession:{hesitationDeduction:invalid}})['trackSession.hesitationDeduction']);
  }
  const input = { mistakes: 0, warnings: 0, hesitations: 2 };
  assert.equal(evaluateMemorization(old, { faces: [input] }).totalHesitations, 2);
  assert.equal(evaluateMemorization(old, { faces: [input] }).grade, 1);
  assert.equal(evaluateReview(old, { hizbs: [input] }).grade, 1);
  assert.equal(evaluateLink(old, input).grade, 1);
  const policy = normalizeGradingPolicy({ weeklyProgram: { hesitationDeduction: 0.02 }, trackSession: { hesitationDeduction: 2 } });
  assert.equal(evaluateMemorization(policy, { faces: [input] }).faces[0].deduction, 0.04);
  assert.equal(evaluateReview(policy, { hizbs: [input] }).totalDeduction, 0.04);
  assert.equal(evaluateLink(policy, input).rawScore, 0.96);
  assert.equal(evaluateTrackSession(policy, { attended: true, segments: [input] }).segments[0].grade, 6);
  assert.equal(evaluateRecitationGroup(policy, 'link', [{ id: 1 }], { 1: { hesitationCount: 2 } }).result.rawScore, 0.96);
  assert.equal(evaluateRecitationGroup(policy, 'review', [{ id: 1, hizbNumber: 1 }], { 1: { hesitationCount: 2 } }).result.totalHesitations, 2);
});

test('hesitation word and ayah marks preserve their type and reject invalid counts and unassigned words', () => {
  const word = { location: '1:1:1', verseKey: '1:1', page: 1, position: 1, charType: 'word', textQpcHafs: 'بسم' };
  const context = { words: [word], wordIndexByLocation: new Map([[word.location, 0]]), allowedByKey: new Map([['1:1', {}]]) };
  const normalizedWordMarks = [], marksByKey = new Map();
  const mark = { startLocation: word.location, endLocation: word.location, markType: 'hesitation' };
  normalizeSelectedWordMarks({ ...context, normalizedWordMarks, marksByKey, wordMarksPayload: [mark] });
  assert.equal(normalizedWordMarks[0].markType, 'hesitation');
  assert.equal(marksByKey.get('1:1').hesitationCount, 1);
  assert.equal(marksByKey.get('1:1').warningCount, 0);
  assert.equal(marksByKey.get('1:1').mistakeCount, 0);
  assert.throws(() => normalizeSelectedWordMarks({ ...context, allowedByKey: new Map(), normalizedWordMarks: [], marksByKey: new Map(), wordMarksPayload: [mark] }), { statusCode: 422 });
  for (const hesitationCount of [-1, 1.5, 1001, Infinity, 'bad']) {
    assert.throws(() => normalizeSelectedAyahMarks([{ surah: 1, ayah: 1, hesitationCount }], context.allowedByKey, new Map(), 1000), { statusCode: 422 });
  }
});

test('ten self reading faces start at page 1 and finish on 10, allowing overlap with review on pages 9 and 10', () => {
  const input = { ayahs, memorized: [{ startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 286 }], faces: 10 };
  const amount = resolveMemorizedReading(input);
  assert.equal(amount.faces, 10);
  assert.equal(amount.ranges[0].startPage, 1);
  assert.equal(amount.ranges.at(-1).endPage, 10);
  const next = resolveMemorizedReading({ ...input, previous: amount.cursor });
  assert.equal(next.ranges[0].startPage, 11);
  assert.equal(next.faces, 10);
});

test('self reading clips to actual memorization, keeps gaps apart, deduplicates coverage and supports reverse plans', () => {
  const memorized = [{ startSurah: 2, startAyah: 10, endSurah: 2, endAyah: 15 }, { startSurah: 2, startAyah: 40, endSurah: 2, endAyah: 45 }];
  const input = { ayahs, memorized, faces: 10 };
  const amount = resolveMemorizedReading(input);
  assert.equal(amount.ranges.length, 2);
  assert.equal(amount.ranges[0].endAyah, 15);
  assert.equal(amount.ranges[1].startAyah, 40);
  assert.ok(amount.faces < 10);
  assert.deepEqual(resolveMemorizedReading({ ...input, memorized: [...memorized, ...memorized] }), amount);
  assert.equal(resolveMemorizedReading({ ...input, memorized: [] }).faces, 0);
  const reverse = resolveMemorizedReading({ ayahs, memorized: [{ startSurah: 114, startAyah: 1, endSurah: 110, endAyah: 3 }], faces: 10, direction: -1 });
  assert.equal(reverse.ranges[0].startSurah, 114);
  assert.equal(reverse.ranges[0].startAyah, 1);
  assert.equal(reverse.ranges.at(-1).endSurah, 110);
  const hizb = resolveMemorizedReading({ ayahs, memorized: [{ startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 286 }], faces: 10, hizbs: 1 });
  assert.equal(hizb.ranges.at(-1).endAyah, 74);
});

test('the former teacher display name is absent from runtime sources while internal supervisor and teacher IDs remain', async () => {
  for (const dir of ['src', 'shared', 'server']) {
    const files = await readdir(new URL(`../${dir}/`, import.meta.url), { recursive: true });
    for (const file of files.filter(file => /\.(jsx?|json)$/.test(file) && !file.startsWith('migrations') && !file.startsWith('data'))) {
      const source = await readFile(new URL(`../${dir}/${file.replaceAll('\\', '/')}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /معلم|معلّم/, `${dir}/${file}`);
    }
  }
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(source, /teacher_completed/);
  assert.match(source, /supervisor_committees/);
});
