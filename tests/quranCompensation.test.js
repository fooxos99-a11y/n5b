import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecitationSessionType, recitationSessionTypeForTask } from '../shared/offline-recitation.js';
import { version } from '../server/migrations/2026.09.26.2-quran-compensation.js';

test('each compensation recitation has its own daily session type', () => {
  assert.equal(recitationSessionTypeForTask({ taskType: 'memorization', compensationIndex: 1 }), 'memorization:compensation:1');
  assert.equal(recitationSessionTypeForTask({ taskType: 'memorization', track: 'mastery', compensationIndex: 2 }), 'mastery:compensation:2');
  assert.equal(recitationSessionTypeForTask({ taskType: 'link', compensationIndex: 3 }), 'link:compensation:3');
  assert.equal(recitationSessionTypeForTask({ taskType: 'link', compensationIndex: 0 }), 'link');
  assert.equal(recitationSessionTypeForTask({ taskType: 'review', compensationIndex: 1 }), 'review:compensation:1');
  assert.equal(normalizeRecitationSessionType('link:compensation:3'), 'link:compensation:3');
  assert.equal(normalizeRecitationSessionType('review:compensation:1'), 'review:compensation:1');
});

test('compensation migration is versioned after the grading system', () => {
  assert.equal(version, '2026.09.26.2');
});
