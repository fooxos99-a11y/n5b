import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('each teacher controls recitation modes from their own account while tests remain managed centrally', async () => {
  const [catalog, settings, server, preferences, preferencesRoute, migration, dashboard, portal, api] = await Promise.all([
    read('../shared/platform-settings-catalog.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../server/index.js'),
    read('../src/components/portal/RecitationSessionSettings.jsx'),
    read('../server/routes/staffRecitationPreferencesRoutes.js'),
    read('../server/migrations/2026.08.30.1-staff-recitation-preferences.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/services/studentsApi.js'),
  ]);
  const staffLegacyKeys = [
    'teacherMemorizationRecitationMode',
    'teacherReviewRecitationMode',
    'teacherLinkRecitationMode',
    'reciterMemorizationRecitationMode',
    'reciterReviewRecitationMode',
    'reciterLinkRecitationMode',
  ];
  for (const key of staffLegacyKeys) {
    assert.doesNotMatch(catalog, new RegExp(key));
    assert.doesNotMatch(settings, new RegExp(key));
    assert.match(server, new RegExp(key));
  }
  assert.doesNotMatch(catalog, /quranTestRecitationMode/);
  assert.doesNotMatch(catalog, /narrationRecitationMode/);
  assert.doesNotMatch(settings, /طريقة تسميع الاختبارات|طريقة تسميع يوم السرد/);
  assert.doesNotMatch(catalog, /recitationMode\('masteryRecitationMode'/);
  assert.doesNotMatch(settings, /masteryRecitationMode/);
  assert.match(server, /preferences\?\.\[`\$\{type\}Mode`\]/);
  assert.match(server, /loadStaffRecitationPreferences\([\s\S]*supervisorId[\s\S]*req\.auth\.role/);
  assert.match(server, /getRecitationEvaluationMode\([\s\S]*recitationPreferences/);
  assert.match(server, /memorizationRecitationMode: teacherMemorizationRecitationMode/);
  assert.match(server, /masteryRecitationMode: teacherMemorizationRecitationMode/);
  assert.doesNotMatch(server, /req\.body\.teacherMemorizationRecitationMode/);
  assert.doesNotMatch(server, /req\.body\.reciterMemorizationRecitationMode/);
  assert.match(server, /requestedEvaluationMode !== evaluationMode/);
  assert.match(server, /هذا التسميع مضبوط على العدّ فقط/);
  assert.match(server, /تحديد أخطاء المصحف غير صحيح/);
  assert.match(preferences, /memorizationMode[\s\S]*masteryMode[\s\S]*reviewMode[\s\S]*linkMode/);
  assert.match(preferences, /<SelectItem value="mushaf">المصحف<\/SelectItem>/);
  assert.match(preferences, /<SelectItem value="count">العد<\/SelectItem>/);
  assert.match(preferences, /void save\(\{ \.\.\.preferences, \[key\]: value \}\)/);
  assert.match(preferences, /حُفظ تلقائيًا/);
  assert.doesNotMatch(preferences, /isSaving \? 'جاري الحفظ…' : 'حفظ'/);
  assert.match(preferences, /\[font-family:var\(--font-ui\)\]/);
  assert.match(preferences, /grid grid-cols-1 gap-4/);
  assert.match(preferencesRoute, /req\.auth\.id/);
  assert.doesNotMatch(preferencesRoute, /req\.params/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_recitation_preferences/);
  assert.match(migration, /staff\.role IN \('supervisor', 'reciter'\)/);
  assert.match(api, /getMyRecitationPreferences/);
  assert.match(api, /updateMyRecitationPreferences/);
  assert.match(dashboard, /visibleActiveSection === 'quranEvaluation'[\s\S]*<RecitationSettingsButton/);
  assert.doesNotMatch(dashboard, /key: 'recitationSessionSettings'/);
  assert.match(portal, /activeSection === 'quranEvaluation'[\s\S]*<RecitationSettingsButton/);
  assert.doesNotMatch(portal, /key: 'recitationSessionSettings'/);
  assert.doesNotMatch(preferences, /label: 'الإتقان'/);
});

test('count-only evaluation is shared while narration uses the Mushaf', async () => {
  const [countDialog, teacher, narration, api] = await Promise.all([
    read('../src/components/portal/CountOnlyEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/dashboard/NarrationStudentPanel.jsx'),
    read('../src/services/studentsApi.js'),
  ]);
  assert.match(countDialog, /عدد التنبيهات/);
  assert.match(countDialog, /عدد الأخطاء/);
  assert.match(teacher, /evaluationModes/);
  assert.match(teacher, /evaluationMode: 'count'/);
  assert.doesNotMatch(teacher, /تعمل الآن دون إنترنت/);
  assert.doesNotMatch(narration, /recitationMode === 'count'/);
  const narrationParts = await read('../src/components/dashboard/NarrationJuzParts.jsx');
  assert.match(narrationParts, /بدأ التسميع/);
  assert.doesNotMatch(narrationParts, />النتيجة</);
  assert.match(narration, /NarrationMethodDialog/);
  assert.match(narration, /MushafRecitationDialog/);
  assert.match(api, /getNarrationPartAyahs/);
});

test('attendance points and repetition controls respect their execution actor and saved settings', async () => {
  const [catalog, settings, teacher, taskList, repeatSelector, listeningChoice, endSelector, server, database] = await Promise.all([
    read('../shared/platform-settings-catalog.js'),
    read('../src/components/dashboard/SettingsSection.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/components/portal/RepeatCountSelector.jsx'),
    read('../src/components/portal/ListeningChoice.jsx'),
    read('../src/components/portal/RecitationEndSelector.jsx'),
    read('../server/index.js'),
    read('../server/db.js'),
  ]);
  assert.doesNotMatch(settings, /settingKey="attendancePoints"|settingKey="manualLateAttendancePoints"/);
  assert.match(taskList, /label: 'حفظ'[\s\S]*label: 'مراجعة'[\s\S]*label: 'ربط'/);
  assert.match(taskList, /recitation-actions/);
  assert.doesNotMatch(taskList, /nazem|بانتظار المزامنة/i);
  assert.match(taskList, /حُفظت النتيجة/);
  assert.match(taskList, /هل كرر/);
  assert.match(taskList, /RepeatCountSelector/);
  assert.match(listeningChoice, /justify-start/);
  assert.match(taskList, /tasks: action\.tasks/);
  assert.match(teacher, /task\.taskType === 'memorization'[\s\S]*repeatCount: selectedStudent\.repeatCount/);
  assert.match(teacher, /allowRepeatCountEditing=\{Boolean\(data\?\.allowRepeatCountEditing\)\}/);
  assert.match(teacher, /executionSources=\{data\?\.executionSources\}/);
  assert.doesNotMatch(settings, /تنفيذ التكرار والسماع عن طريق/);
  assert.doesNotMatch(catalog, /select\('repeatExecutionSource'/);
  assert.doesNotMatch(settings, /label="تعديل عدد التكرار"/);
  assert.doesNotMatch(settings, /label="تعديل عدد السماع"/);
  assert.doesNotMatch(catalog, /toggle\('allowRepeatCountEditing'/);
  assert.match(database, /\('allowRepeatCountEditing', 'false'\)/);
  assert.match(repeatSelector, /label = 'التكرار'/);
  assert.match(repeatSelector, /compact=\{compact\}/);
  assert.doesNotMatch(repeatSelector, /\$\{label\} \(\$\{selected\}\)/);
  assert.match(taskList, /ariaLabel=\{`هل كرر/);
  assert.match(taskList, /TeacherRecitationPractice/);
  assert.match(taskList, /compact/);
  assert.match(repeatSelector, /ListeningChoice/);
  assert.doesNotMatch(settings, /repeatPointsKey|listeningPointsKey|ضوابط التسميع/);
  assert.doesNotMatch(settings, /CountPointsSettingField/);
  assert.doesNotMatch(settings, /key !== 'repeatExecutionSource'/);
  assert.match(taskList, /const listeningControl =[\s\S]*<ListeningChoice/);
  assert.match(taskList, /teacherExecutionMode && \['teacher', 'both'\]\.includes\(executionSources\?\.repeat/);
  assert.match(taskList, /editable=\{repeatEditable && !repeatClaimedByStudent\}/);
  assert.doesNotMatch(taskList, /optionMax/);
  assert.doesNotMatch(taskList, /اكتمل الإتقان|selectedCompletions/);
  assert.match(taskList, /const repeatEditable = teacherExecutionMode[\s\S]*action\.key === 'saved'/);
  assert.doesNotMatch(taskList, /key: 'compensation'|label: 'التعويض'/);
  assert.match(listeningChoice, /value = 1/);
  assert.match(listeningChoice, /label: 'نعم'[\s\S]*label: 'لا'/);
  assert.match(endSelector, /ariaLabel="سورة النهاية"[\s\S]*ariaLabel="آية النهاية"/);
  assert.doesNotMatch(endSelector, /surahs\.length > 1/);
  assert.match(teacher, /listeningCount: selectedStudent\.listeningCount/);
  assert.match(catalog, /number\('memorizationListeningCount', 'عدد مرات سماع الحفظ', 3, 1\)/);
  assert.match(catalog, /number\('masteryListeningCount', 'عدد مرات سماع الإتقان', 3, 1\)/);
  assert.match(database, /\('memorizationListeningCount', '3'\)/);
  assert.match(database, /\('masteryListeningCount', '3'\)/);
  assert.doesNotMatch(server, /RepeatPointValue|ListeningPointValue/);
  assert.match(server, /allowRepeatCountEditing: false/);
  assert.match(server, /allowListeningCountEditing: false/);
  assert.doesNotMatch(server, /settings\.allowRepeatCountEditing = true/);
  assert.match(server, /allowRepeatCountEditing: settings\.allowRepeatCountEditing[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(server, /allowListeningCountEditing: settings\.allowListeningCountEditing[\s\S]*canStudentExecuteQuranTask\(settings, 'memorization'\)/);
  assert.match(server, /practiceCompletionCount\(requestedRepeatCount/);
  assert.match(server, /canTeacherExecuteQuranTask\(settings, 'repeat'\)/);
  assert.match(server, /options: candidates[\s\S]*compareQuranPositionInDirection/);
  assert.match(server, /expectedRepeatCount[\s\S]*actual_repeat_count = \?/);
  assert.match(server, /practiceCompletionCount\(requestedRepeatCount, expectedRepeatCount\)/);
  assert.match(server, /expectedListeningCount = getTeacherExpectedListeningCount\(task, settings\)/);
  assert.match(server, /function getTeacherExpectedListeningCount\(task, settings\)[\s\S]*normalizeRepeatCount\(task.track/);
  assert.match(server, /const completed = row\.passed;/);
  assert.doesNotMatch(server, /nazem/i);
  assert.match(server, /expectedListeningCount[\s\S]*actual_listening_count = \?/);
});
