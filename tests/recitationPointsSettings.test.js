import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const REMOVED_EVALUATION_KEY = /(?:teacher|memorization|memorizationQuarterFace|memorizationHalfFace|mastery|masteryQuarterFace|masteryHalfFace|review|link)Evaluation(?:MaxScore|WarningDeduction|MistakeDeduction|PassingScore|OneFace|TwoFaces|ThreePlusFaces)/;
const REMOVED_POINT_SETTING = /memorizationPoints|reviewPoints|linkPoints|RepeatPointValue|ListeningPointValue|PointsPercent|attendancePoints|AttendancePoints|lateDeductionPoints|lateEveryMinutes/;

test('old evaluation scoring and recitation point settings are removed everywhere', async () => {
  const [server, database, settingsSection, catalog, platformSettings, dialog] = await Promise.all([
    read('../server/index.js'),
    read('../server/db.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../shared/platform-settings-catalog.js'),
    read('../server/services/platformSettings.js'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
  ]);
  for (const source of [server, database, settingsSection, catalog]) assert.doesNotMatch(source, REMOVED_EVALUATION_KEY);
  for (const source of [server, database, settingsSection, catalog, platformSettings]) assert.doesNotMatch(source, REMOVED_POINT_SETTING);
  assert.doesNotMatch(server, /getTeacherTaskEvaluationPolicy|evaluationPolicies|evaluationSettings: \{/);
  assert.match(server, /gradingPolicy: await loadGradingPolicyForDate\(db\(\), date, \{ freeze: false \}\)/);
  assert.doesNotMatch(server, /setQuranTaskGroupReward|calculateEvaluatedGroupReward|calculateStudentExecutionPoints|getRecitationPoints/);
  assert.doesNotMatch(settingsSection, /EvaluationUnitSelector|EvaluationScalingHelp|حد النجاح|recitationPointsFields/);
  assert.doesNotMatch(dialog, /evaluation-settings|calculateRecitationScore/);
});
