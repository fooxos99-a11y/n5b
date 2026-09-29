import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStaffRecitationPreferences, saveStaffRecitationPreferences } from '../server/services/staffRecitationPreferences.js';

test('memorization and mastery use one setting even for conflicting legacy preferences', () => {
  assert.deepEqual(normalizeStaffRecitationPreferences({ memorizationMode: 'count', masteryMode: 'mushaf', reviewMode: 'mushaf', linkMode: 'count' }), {
    memorizationMode: 'count', masteryMode: 'count', reviewMode: 'mushaf', linkMode: 'count',
  });
  assert.equal(normalizeStaffRecitationPreferences({}, { memorizationMode: 'count', masteryMode: 'mushaf' }).masteryMode, 'count');
});

test('saving the shared memorization mode persists both tracks for the authenticated staff member', async () => {
  const connection = { query: async (sql, values) => {
    assert.match(sql, /ON DUPLICATE KEY UPDATE/);
    assert.deepEqual(values, [13, 'count', 'count', 'mushaf', 'mushaf']);
    return [{}];
  } };
  const saved = await saveStaffRecitationPreferences(connection, 13, { memorizationMode: 'count', masteryMode: 'mushaf' });
  assert.equal(saved.masteryMode, saved.memorizationMode);
});
