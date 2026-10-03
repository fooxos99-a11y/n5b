import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { platformSettingsByKey } from '../shared/platform-settings-catalog.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const removedSectionKeys = ['studentExecutionCorrections', 'programs', 'culturalCompetition'];

test('execution corrections, programs and cultural competitions have no routes, permissions or settings', async () => {
  const [routes, serverPermissions, clientPermissions] = await Promise.all([
    read('../src/lib/sectionRoutes.js'),
    read('../server/services/dashboardPermissions.js'),
    read('../src/lib/dashboardPermissions.js'),
  ]);
  for (const key of removedSectionKeys) {
    for (const source of [routes, serverPermissions, clientPermissions]) assert.doesNotMatch(source, new RegExp(`'${key}'`));
  }
  for (const key of ['learningPathsEnabled', 'programsSectionEnabled', 'culturalCompetitionSectionEnabled']) {
    assert.equal(platformSettingsByKey.has(key), false);
  }
});

test('removed features are not reachable from the client or server', async () => {
  const [server, app, dashboard, portal, api] = await Promise.all([
    read('../server/index.js'),
    read('../src/App.jsx'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/services/studentsApi.js'),
  ]);
  assert.doesNotMatch(server, /\/api\/quran-execution-corrections|administrativeCorrection|ExecutionCorrection/);
  assert.doesNotMatch(server, /programRoutes|createProgramRouter|'\/api\/programs'|culturalGamesRoutes|createCulturalGamesRouter|cultural-games/);
  assert.doesNotMatch(app, /LetterHiveGame|CategoriesGame|AuctionGame|GuessImageGame/);
  for (const source of [dashboard, portal]) {
    assert.doesNotMatch(source, /studentExecutionCorrections|ProgramsSection|StudentProgramsSection|culturalCompetition|CulturalCompetitionSection/);
  }
  assert.doesNotMatch(api, /ExecutionCorrection|\/programs|cultural-games/);

  await Promise.all([
    'StudentExecutionCorrectionsSection.jsx', 'ProgramsSection.jsx', 'CulturalCompetitionSection.jsx',
  ].map((file) => assert.rejects(access(new URL(`../src/components/dashboard/${file}`, import.meta.url)))));
  await Promise.all([
    '../server/routes/programRoutes.js', '../server/routes/culturalGamesRoutes.js',
    '../src/components/games', '../src/components/programs', '../shared/execution-correction-options.js',
  ].map((path) => assert.rejects(access(new URL(path, import.meta.url)))));
});

test('the standalone Quran tests feature is gone; the track session is the test', async () => {
  const [routes, serverPermissions, clientPermissions, server, dashboard, api, offline, settings, notifications, navigation, database] = await Promise.all([
    read('../src/lib/sectionRoutes.js'),
    read('../server/services/dashboardPermissions.js'),
    read('../src/lib/dashboardPermissions.js'),
    read('../server/index.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/services/studentsApi.js'),
    read('../src/services/offlineOperationsService.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../src/components/dashboard/NotificationSettings.jsx'),
    read('../src/lib/settingsNavigation.js'),
    read('../server/db.js'),
  ]);
  for (const source of [routes, serverPermissions, clientPermissions, dashboard]) {
    assert.doesNotMatch(source, /'quranTests'|quran-tests|QuranTestsSection/);
  }
  assert.doesNotMatch(server, /\/api\/quran-tests|'quranTests'|quranTest[A-Z]/);
  assert.doesNotMatch(api, /quran-tests|QuranTest/);
  assert.doesNotMatch(offline, /quran_test_result|quran-tests/);
  assert.doesNotMatch(database, /'quranTest[A-Z]\w*'/);
  for (const source of [settings, notifications]) {
    assert.doesNotMatch(source, /quranTest|إعدادات الاختبار|موعد الاختبار|يوم السرد والاختبار/);
  }
  assert.match(navigation, /label: 'يوم السرد'/);
  assert.match(dashboard, /key: 'trackSession', label: 'جلسة المسار'/);
  for (const key of ['quranTestsSectionEnabled', 'quranTestMessageTemplate', 'quranTestMaxScore', 'quranTestPassingScore', 'quranTestRetestScore']) {
    assert.equal(platformSettingsByKey.has(key), false);
  }
  await Promise.all(['QuranTestsSection.jsx', 'QuranTestAppointmentsDialog.jsx']
    .map((file) => assert.rejects(access(new URL(`../src/components/dashboard/${file}`, import.meta.url)))));
});

test('plans offer memorization and mastery with separate achievement indicators', async () => {
  const [plans, metrics, server] = await Promise.all([
    read('../src/components/dashboard/StudentPlansSection.jsx'), read('../src/components/dashboard/reports/reportMetrics.js'), read('../server/index.js'),
  ]);
  assert.match(plans, /aria-label="مسار الخطة"/);
  assert.match(plans, /track: form.track/);
  assert.match(metrics, /أوجه الحفظ/); assert.match(metrics, /أوجه الإتقان/);
  assert.match(server, /AS masteryTotal/); assert.match(server, /AS masteryDone/);
});

test('recitation mushaf reads any page with the index while marks stay inside the amount', async () => {
  const [dialog, summary, countDialog, permissions] = await Promise.all([
    readFile(new URL('../src/components/portal/MushafRecitationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationGradeSummary.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/CountOnlyEvaluationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/dashboardPermissions.js', import.meta.url), 'utf8'),
  ]);
  assert.match(dialog, /<StudentMushafIndexDialog/);
  assert.match(dialog, /getOfflineMushafPage\(viewPage\)/);
  assert.match(dialog, /total=\{MUSHAF_PAGE_COUNT\}/);
  assert.match(dialog, /allowedRange=\{activeEntry\.data\.allowedRange\}\s*markingMode/);
  assert.match(dialog, /key=\{`browse-\$\{browsePage\.number\}`\}[\s\S]*?\/>/);
  assert.doesNotMatch(dialog.slice(dialog.indexOf('key={`browse-'), dialog.indexOf('key={`browse-') + 200), /markingMode/);
  assert.doesNotMatch(summary + countDialog, /إجمالي الأخطاء|RecitationGradeSummary evaluation/);
  // Management has no mushaf page, so it is not a grantable permission either.
  assert.doesNotMatch(permissions, /key: 'mushaf'/);
});
