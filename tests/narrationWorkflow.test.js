import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { pickRandomMushafEntry } from '../src/lib/randomMushafExcerpt.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('random Mushaf excerpts stay unique until every eligible page is used', () => {
  let state = { index: -1, visitedIndexes: [] };
  const picks = [];
  for (const value of [0, 0, 0]) {
    state = pickRandomMushafEntry(3, state.visitedIndexes, state.index, () => value);
    picks.push(state.index);
  }
  assert.deepEqual(picks, [0, 1, 2]);
  const restarted = pickRandomMushafEntry(3, state.visitedIndexes, state.index, () => 0);
  assert.notEqual(restarted.index, state.index);
});

test('narration exposes both result entry and Mushaf recitation without a global mode', async () => {
  const [narrationPanel, settings, catalog, server, controls] = await Promise.all([
    read('../src/components/dashboard/NarrationStudentPanel.jsx'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../shared/platform-settings-catalog.js'),
    read('../server/index.js'),
    read('../src/components/portal/MushafPageControls.jsx'),
  ]);
  assert.match(await read('../src/components/dashboard/NarrationJuzParts.jsx'), /بدأ التسميع/);
  assert.match(await read('../src/lib/narrationParts.js'), /part\.rangeLabel/);
  assert.match(controls, /المقطع التالي/);
  for (const source of [narrationPanel, settings, catalog]) {
    assert.doesNotMatch(source, /quranTestRecitationMode|narrationRecitationMode/);
  }
  assert.match(server, /\['mushaf', 'count'\]\.includes\(req\.body\.evaluationMode\)/);
});

test('narration supports exclusive all-committees or multiple selected committees with a visible loading state', async () => {
  const [section, selector, server] = await Promise.all([
    read('../src/components/dashboard/NarrationDaySection.jsx'),
    read('../src/components/dashboard/CommitteeMultiSelect.jsx'),
    read('../server/index.js'),
  ]);
  assert.match(await read('../src/components/dashboard/NarrationCreateDialog.jsx'), /committeeIds: \['all'\]/);
  assert.match(section, /جاري تحميل يوم السرد/);
  assert.match(selector, /onChange\?\.\(\['all'\]\)/);
  assert.match(selector, /<CheckboxOption/);
  const checkbox = await read('../src/components/ui/checkbox-option.jsx');
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /checked=\{checked\}/);
  assert.match(server, /s\.committee_id IN \(\$\{committeeIds\.map/);
  assert.match(server, /req\.auth\?\.role !== 'supervisor'\s*\|\| scope === 'all'/);
});

test('student event notifications are scoped, deduplicated, and visible in the shared portal header', async () => {
  const [server, portal, button, migration] = await Promise.all([
    read('../server/index.js'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/components/notifications/NotificationButton.jsx'),
    read('../server/migrations/2026.09.01.1-student-test-notifications.js'),
  ]);
  assert.match(server, /\/api\/student-notifications/);
  assert.match(server, /narration_\$\{type\}:/);
  assert.match(portal, /<StudentNotificationButton/);
  assert.match(button, /الإشعارات/);
  assert.match(button, /min-h-11|h-11/);
  assert.match(migration, /app_notifications_dedupe_unique/);
  assert.match(migration, /sample_pages_json/);
});

