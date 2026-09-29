import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('grading settings live in their own settings category with a dedicated save', async () => {
  const [navigation, settings, panel] = await Promise.all([
    read('../src/lib/settingsNavigation.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../src/components/dashboard/GradingSettingsPanel.jsx'),
  ]);

  const labels = [...navigation.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['البرنامج الأسبوعي', 'جلسة المسار', 'الجلسة الأسبوعية', 'يوم السرد', 'النقاط والترتيب', 'إعدادات الإشعارات', 'إنهاء الفصل وطلبات الحذف']);
  assert.match(navigation, /key: 'settingsGrading', slug: 'settings-grading', label: 'البرنامج الأسبوعي'/);
  // The weekly program page is a stack of cards: program, thresholds, margin and repetitions, attendance, compensation.
  assert.match(settings, /const programPage = \(\s*<GradingSettingsPanel\s*section="program"\s*onStatusChange=\{setPolicyStatus\}\s*extraCards=\{\[[\s\S]*title: 'التحضير'[\s\S]*مسؤول تحضير الطلاب[\s\S]*title: 'التعويض والتجاوز'[\s\S]*تعويض الحفظ المتأخر/);
  assert.match(settings, /\{activeCategory === 'settingsGrading' && <div className="mx-auto w-full max-w-5xl">\{programPage\}<\/div>\}/);
  assert.match(settings, /<SettingsCategoryPanel category="settingsTrackSession" activeCategory=\{activeCategory\} title="جلسة المسار">\s*<GradingSettingsPanel section="track" onStatusChange=\{setPolicyStatus\} \/>/);
  assert.match(settings, /<SettingsCategoryPanel category="settingsWeeklySession" activeCategory=\{activeCategory\} title="الجلسة الأسبوعية">\s*<GradingSettingsPanel section="weekly" onStatusChange=\{setPolicyStatus\} \/>/);
  // One autosave status for every settings page, the grading policy included.
  assert.match(settings, /const showSaving = isSaving \|\| policyStatus === 'saving';/);
  assert.doesNotMatch(settings, /GRADING_POLICY_CATEGORIES|المقادير التي تظهر في جلسة التسميع/);
  assert.match(navigation, /defaultSettingsNavigationKey = 'settingsGrading'/);
  assert.doesNotMatch(settings, /gradingPolicy|gradingApi/);

  assert.match(panel, /gradingApi\.getPolicy\(\)/);
  assert.match(panel, /gradingApi\.savePolicy\(toPolicy\(value\)\)/);
  assert.doesNotMatch(panel, /studentsApi\.updateSettings/);
  assert.match(panel, /from '\.\.\/\.\.\/\.\.\/shared\/grading-policy\.js'/);
  // Autosave and total validation remain, without the removed summary copy.
  assert.match(panel, /useQueuedAutosave\(/);
  assert.match(panel, /message=\{errors.total\}/);
  assert.doesNotMatch(panel, /تظل الأسابيع|مجموع الدرجات:/);
  assert.match(panel, /title: 'تعذر حفظ إعدادات الدرجات'[^}]*variant: 'destructive'/);
  assert.match(panel, /<ErrorState message=\{loadError\} onRetry=\{loadPolicy\} \/>/);
});

test('grading settings group every policy field and summarize the maxima', async () => {
  const panel = await read('../src/components/dashboard/GradingSettingsPanel.jsx');

  for (const title of ['أيام الحضور', 'درجة الحضور', 'الدرجات اليومية', 'الخصومات والحدود']) {
    assert.match(panel, new RegExp(`>${title}<`));
  }
  for (const title of ['البرنامج الأسبوعي', 'حدود الحفظ حسب عدد الأوجه', 'الهامش والتكرار']) {
    assert.match(panel, new RegExp(`<SettingsCard title="${title}">`));
  }
  assert.doesNotMatch(panel, /الإحصائيات/);
  assert.match(panel, /Number\(row\.faces\)\.toLocaleString\('ar-SA'\)/);
  assert.match(panel, /if \(section === 'track'\)[\s\S]*trackFields\.map/);
  assert.match(panel, /if \(section === 'weekly'\)[\s\S]*field=\{weeklySessionField\}/);
  for (const path of [
    'weeklyProgram.attendance.present', 'weeklyProgram.attendance.late', 'weeklyProgram.attendance.excused', 'weeklyProgram.attendance.absent',
    'weeklyProgram.memorizationDaily', 'weeklyProgram.linkDaily', 'weeklyProgram.reviewDaily', 'weeklyProgram.readingDaily',
    'weeklyProgram.mistakeDeduction', 'weeklyProgram.warningDeduction',
    'weeklyProgram.linkFailThreshold', 'weeklyProgram.hizbDeductionLimit', 'weeklyProgram.margin',
    'trackSession.attendance', 'trackSession.segmentCount', 'trackSession.segmentMax', 'trackSession.mistakeDeduction', 'trackSession.warningDeduction',
    'weeklySession.attendance', 'generalMargin', 'statistics.repetitionsPerFace',
  ]) {
    assert.match(panel, new RegExp(`path: '${path.replace(/\./g, '\\.')}'`));
  }
  assert.match(panel, /key: 'workDays', label: 'أيام الحضور والحفظ والربط والمراجعة'/);
  assert.match(panel, /key: 'readingDays', label: 'أيام القراءة الذاتية'/);
  assert.match(panel, /<MultiSelectSetting[\s\S]*options=\{weekDayOptions\}/);
});

test('grading settings validate ranges and manage memorization thresholds', async () => {
  const panel = await read('../src/components/dashboard/GradingSettingsPanel.jsx');

  assert.match(panel, /const RATIO = \{ min: 0, max: 1, step: '0\.01' \}/);
  assert.match(panel, /const AMOUNT = \{ min: 0,/);
  for (const path of ['mistakeDeduction', 'warningDeduction', 'linkFailThreshold', 'hizbDeductionLimit']) {
    assert.match(panel, new RegExp(`path: 'weeklyProgram\\.${path}', label: '[^']+', \\.\\.\\.RATIO`));
  }
  assert.match(panel, /const thresholdError = rangeError\(row\.threshold, RATIO\)/);
  assert.match(panel, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(panel, /'عدد الأوجه مكرر'/);

  assert.match(panel, /const addThreshold = \(\) =>/);
  assert.match(panel, /onClick=\{addThreshold\}/);
  assert.match(panel, /const deleteThreshold = \(rowKey\) => updateThresholds\(\(rows\) => rows\.filter\(\(row\) => row\.isBase \|\| row\.rowKey !== rowKey\)\)/);
  assert.match(panel, /isBase: row\.faces === 1/);
  assert.match(panel, /\{!row\.isBase && \(\s*<ManagementIconButton/);
  assert.match(panel, /الدرجة المساوية للحد أو الأقل منه = راسب/);
});

test('grading settings follow the shared UI rules', async () => {
  const panel = await read('../src/components/dashboard/GradingSettingsPanel.jsx');

  assert.match(panel, /\[font-family:var\(--font-ui\)\]/);
  assert.doesNotMatch(panel, /\b(?:window\.)?(?:alert|confirm|prompt)\(/);
  assert.doesNotMatch(panel, /console\.log/);
  assert.match(panel, /from '@\/components\/ui\/button'/);
  assert.match(panel, /from '@\/components\/ui\/input'/);
});

test('student plan editor uses face presets, ahzab review and self reading amounts', async () => {
  const plans = await read('../src/components/dashboard/StudentPlansSection.jsx');

  assert.match(plans, /const dailyPageOptions = \[\['1', 'وجه'\], \['2', 'وجهان'\], \['custom', 'مخصص'\]\]/);
  assert.doesNotMatch(plans, /ربع وجه|نصف وجه|وجه ونصف/);
  assert.match(plans, /presetKey="dailyPreset" valueKey="dailyPages" options=\{dailyPageOptions\} min="0\.25" step="0\.25"/);

  // Review is by ahzab only (1 to 4 or a custom count); the weekly split is no longer offered.
  assert.match(plans, /const reviewHizbOptions = \[\['1', 'حزب'\], \['2', 'حزبان'\], \['3', 'ثلاثة أحزاب'\], \['4', 'أربعة أحزاب'\], \['custom', 'مخصص'\]\]/);
  assert.match(plans, /label="المراجعة \(أحزاب\)"/);
  assert.doesNotMatch(plans, /تقسيم المراجعة على أسبوع|form\.reviewSplitWeekly &&/);
  assert.match(plans, /const MAX_REVIEW_HIZBS = 60/);
  assert.match(plans, /reviewHizbs: getReviewHizbs\(form\.reviewHizbPreset, form\.reviewHizbs\)/);
  assert.match(plans, /reviewHizbs: plan\.reviewHizbs \?\? 1/);
  assert.doesNotMatch(plans, /جزئين|ثلاثة أجزاء/);

  assert.match(plans, /label="القراءة الذاتية اليومية \(أوجه\)"/);
  assert.doesNotMatch(plans, /'الافتراضي'/);
  assert.match(plans, /readingFaces: getReadingFaces\(form\.readingPreset, form\.readingFaces\)/);
  assert.match(plans, /readingFaces: Number\(plan\.readingFaces\) \|\| DEFAULT_PLAN_READING_FACES/);
});

test('the daily self-reading amount lives in each plan, not in the grading settings', async () => {
  const [panel, policy, migration] = await Promise.all([
    read('../src/components/dashboard/GradingSettingsPanel.jsx'),
    read('../shared/grading-policy.js'),
    read('../server/migrations/2026.09.26.2-plan-reading-faces.js'),
  ]);
  assert.doesNotMatch(panel, /defaultReadingFaces/);
  assert.doesNotMatch(policy, /defaultReadingFaces/);
  assert.match(migration, /WHERE reading_faces IS NULL/);
  assert.match(migration, /reading_faces SMALLINT UNSIGNED NOT NULL/);
});

test('editing a plan offers continuing it or keeping it and starting a new one', async () => {
  const [plans, server] = await Promise.all([
    read('../src/components/dashboard/StudentPlansSection.jsx'),
    read('../server/index.js'),
  ]);
  assert.match(plans, /'متابعة الخطة الحالية'/);
  assert.match(plans, /'حفظ الحالية وبدء خطة جديدة'/);
  assert.match(plans, /role="radiogroup" aria-label="طريقة حفظ التعديل"/);
  assert.match(plans, /mode: startsNewPlan \? PLAN_SAVE_MODES\.new : PLAN_SAVE_MODES\.continue/);
  assert.match(server, /const continuedPlan = planSaveMode === PLAN_SAVE_MODES\.continue \? existingPlan : null;/);
  // A continued plan keeps its start, unless it has not started yet: then it may move forward.
  assert.match(server, /const notStartedPlan = Boolean\(continuedPlan && !Number\(continuedPlan\.hasExecutedTasks\) && String\(continuedPlan\.startDate \|\| ''\) >= todayDate && req\.body\.startDate\);/);
  assert.match(server, /const startDate = notStartedPlan \? requestedStartDate : continuedPlan\?\.startDate \|\| requestedStartDate;/);
  assert.match(server, /await resolveContinuedReviewCursor\(connection, continuedPlan, minimumPlanStartDate\)/);
  assert.match(server, /continuedPlan\?\.id \|\| null,\r?\n\s+Number\(existingPlan\?\.planVersion \|\| 0\) \+ 1,/);
});
