import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('review and link amount settings are persisted independently', async () => {
  const [database, server, settings] = await Promise.all([
    read('../server/db.js'),
    read('../server/index.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
  ]);

  assert.match(database, /\('studentReviewAmountEditable', 'true'\)/);
  assert.match(database, /\('studentLinkAmountEditable', 'true'\)/);
  assert.match(server, /studentReviewAmountEditable: settings\.studentReviewAmountEditable !== 'false'/);
  assert.match(server, /studentLinkAmountEditable: false/);
  assert.match(settings, /studentReviewAmountEditable: true/);
  assert.doesNotMatch(settings, /label="تعديل مقدار المراجعة اليومية"/);
  assert.doesNotMatch(settings, /label="تعديل مقدار الربط"/);
});

test('fixed task amount removes student controls and is enforced by the server', async () => {
  const [server, toggle] = await Promise.all([
    read('../server/index.js'),
    read('../src/components/ui/setting-toggle.jsx'),
  ]);

  assert.match(server, /studentReviewAmountEditable: Boolean\(settings\.studentReviewAmountEditable\)[\s\S]*executionAyahs/);
  assert.match(server, /canStudentSetQuranTaskEnd\(settings, first\.taskType, endComparison\)/);
  assert.match(server, /practiceCompletionCount\(req\.body\.repeatCount, expectedRepeatCount\)/);
  assert.match(toggle, /description = ''/);
  assert.match(toggle, /text-muted-foreground/);
});
