import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('teacher dashboard exposes student plans while keeping other student administration hidden', async () => {
  const [dashboard, accountPortal, evaluationSection, routes] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/TeacherEvaluationSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /isSupervisor && \['manualAttendance', 'students'\]\.includes\(section\.key\)/);
  assert.match(dashboard, /isSupervisor && section\.key === 'studentPlans'\) return true/);
  assert.match(dashboard, /const supervisorSectionOrder[\s\S]*\['teacherPoints', 3\][\s\S]*\['reports', 4\][\s\S]*\['studentPlans', Number.POSITIVE_INFINITY\]/);
  assert.match(dashboard, /supervisorSectionOrder\.get\(first\.key\)/);
  assert.match(dashboard, /key: 'previousRecitationSessions'[\s\S]*permissionKey: 'quranEvaluation'/);
  assert.match(dashboard, /<TeacherPreviousSessionsPanel \/>/);
  assert.match(dashboard, /key: 'mushaf', label: 'المصحف'/);
  assert.match(dashboard, /section\.key === 'mushaf'\) return isSupervisor;/);
  assert.match(accountPortal, /key: 'studentPlans', label: 'خطط الطلاب'/);
  assert.match(accountPortal, /settings\.teacherManualPointsEnabled[\s\S]*key: 'teacherPoints', label: 'الإضافة والخصم'/);
  assert.ok(accountPortal.indexOf("key: 'staffAttendance', label: 'التحضير'") < accountPortal.indexOf("key: 'quranEvaluation', label: 'جلسات التسميع'"));
  assert.match(accountPortal, /case 'studentPlans':[\s\S]*<StudentPlansSection hideCommitteeFilter/);
  assert.match(accountPortal, /key: 'previousRecitationSessions'[\s\S]*key: 'teacherPoints'[\s\S]*key: 'teacherReports'[\s\S]*key: 'calls'[\s\S]*key: 'studentPlans'/);
  assert.match(accountPortal, /const ReportsSection = lazy\(\(\) => import\('@\/components\/dashboard\/ReportsSection'\)\);/);
  assert.match(accountPortal, /case 'teacherReports':[\s\S]*?<ReportsSection[\s\S]*?teacherScoped[\s\S]*?canViewStandardReports[\s\S]*?canViewTeacherPoints=\{settings\.teacherManualPointsEnabled\}/);
  assert.doesNotMatch(accountPortal, /TeacherReportsSection/);
  assert.match(evaluationSection, /<TeacherEvaluationDialog supervisorId=\{supervisorId\} inline \/>/);
  assert.doesNotMatch(evaluationSection, /فتح التقييم|useState/);
  assert.match(routes, /\['previousRecitationSessions', 'previous-recitation-sessions'\]/);
  const portalRoutes = routes.slice(routes.indexOf('export const portalSectionRoutes'));
  assert.match(portalRoutes, /\['studentPlans', 'student-plans'\]/);
});

test('teacher attendance and reports are constrained to linked committees on the server', async () => {
  const [server, attendance, reports, metrics] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ManualAttendanceSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/reports/reportMetrics.js', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /يمكنك تحضير طلاب حلقاتك فقط/);
  assert.match(server, /requireManagementReportAccess/);
  assert.match(server, /sc\.supervisor_id = \? AND sc\.committee_id = s\.committee_id/);
  assert.doesNotMatch(attendance, /طلاب حلقاتي|getMyCommittees/);
  assert.match(attendance, /<DashboardMobileHeaderActions>[\s\S]*headerLabel[\s\S]*<\/DashboardMobileHeaderActions>/);
  assert.match(attendance, /!teacherScoped && \([\s\S]*<ManagementToolbar>/);
  assert.doesNotMatch(reports, /getMyCommittees/);
  // Teachers get no circle selector and no archive; the server scopes every report to their circles.
  assert.match(reports, /canViewStandardReports && !teacherScoped \? cachedReport\('scoped-committees'/);
  assert.match(reports, /<SelectTrigger aria-label="الفترة"/);
  assert.match(reports, /studentsApi\.getOverviewReport\(\{ from, to, committeeId: scopeCommittee \}\)/);
  for (const label of ['البرنامج الأسبوعي', 'الجلسة الأسبوعية', 'جلسة المسار', 'يوم السرد', 'مستويات الطلاب', 'عدد الحلقات']) {
    assert.match(metrics, new RegExp(`label: '${label}'`));
  }
});

test('reports drop execution follow-up and student points and add the weekly session reports', async () => {
  const [dashboard, accountPortal, reports, server, overview] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/reports/reportMetrics.js', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /isSupervisor && \['teacherPoints', 'calls', 'reports'\]\.includes\(section\.key\)\) return true/);
  assert.match(dashboard, /canViewStandardReports=\{isSupervisor \|\|/);
  assert.doesNotMatch(dashboard + accountPortal + reports, /ExecutionFollowup|executionFollowup|studentPoints|StudentPointsReport/);
  // Both weekly sessions are indicators whose details list each student's result.
  assert.match(overview, /weeklySessionMetric\(grades\.weeklySession, inCommittee, filtered\)/);
  assert.match(overview, /trackSessionMetric\(grades\.trackSession, inCommittee, filtered\)/);
  assert.doesNotMatch(reports, /aria-label="الطالب"|aria-label="نوع التقرير"/);
  assert.doesNotMatch(server, /execution-followup|student-point-transactions|ExecutionFollowup/);
  assert.match(server, /app\.get\('\/api\/reports\/grading-sessions', requireReportsOrOwnCommittee/);
  assert.match(server, /progress\|grading-sessions\|recitation-sessions/);
  assert.match(server, /grades,\r?\n/);
  assert.doesNotMatch(overview, /التنفيذ الطبيعي|التنفيذ المسجل|quranExecution/);
  assert.match(overview, /label: 'يوم السرد'/);
});

test('attendance source does not override the independent Quran execution sources', async () => {
  const [dashboard, settings, server] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'NotificationSettings.jsx'].map(name => readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8'))).then(parts => parts.join('\n')),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, /recitationAttendanceSource: value,[\s\S]*attendanceManualEnabled: value !== 'teacher'/);
  assert.match(server, /!settings\.attendanceManualEnabled[\s\S]*!settings\.attendanceAccountEnabled[\s\S]*settings\.recitationAttendanceSource !== 'teacher'/);
  assert.doesNotMatch(server, /settings\.recitationAttendanceSource === 'teacher'[\s\S]*settings\.quranTaskExecutionSource = 'teacher'/);
  assert.doesNotMatch(dashboard, /بناءً على المعلم/);
});

test('teacher reports use a date range and call rooms lock to the linked committee', async () => {
  const [reports, periods, server, calls, callRoutes] = await Promise.all([
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/reportPeriods.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/calls/CallsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/callRoutes.js', import.meta.url), 'utf8'),
  ]);

  // A named period (week, month, quarter, year) or a custom range chosen in a dialog.
  assert.match(periods, /week: 'هذا الأسبوع',\s*month: 'هذا الشهر',\s*quarter: 'هذا الربع',\s*year: 'هذه السنة',\s*custom: 'مخصص'/);
  assert.match(reports, /const range = useMemo\(\(\) => \(archiveId \? null : reportRange\(period, custom\)\)/);
  assert.match(reports, /<DialogTitle>فترة مخصصة<\/DialogTitle>/);
  assert.match(server, /quranReferenceMode: settings\.quranReferenceMode === 'page' \? 'page' : 'ayah'/);
  assert.match(server, /const progressScoredTaskTypes = \['memorization', 'review', 'link'\]/);
  assert.match(server, /progressScoredTaskTypes\.map\(\(type\) => tasks\[type\]\.percentage\)/);
  assert.match(calls, /committeeId: form\.committeeId === 'general' \? null : form\.committeeId/);
  assert.match(calls, /!committeeSelectionLocked && \(committees\.length > 0 \|\| canCreateGeneral\)/);
  assert.match(calls, /committeeSelectionLocked && committees\.length === 0/);
  assert.match(callRoutes, /r\.committee_id IS NULL/);
  assert.match(callRoutes, /COALESCE\(c\.name, 'غرفة عامة'\)/);
  assert.match(callRoutes, /committeeSelectionLocked: req\.auth\?\.role === 'supervisor'/);
  assert.match(callRoutes, /req\.auth\?\.role === 'supervisor'[\s\S]*supervisorCommittees\[0\]\.id/);
});

test('mushaf fonts use packaged offline assets and keep a readable fallback', async () => {
  const [fonts, page] = await Promise.all([
    readFile(new URL('../src/lib/quranFonts.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MadaniMushafPage.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(fonts, /resolveAssetUrl\('quran\/hafs\/fonts\/uthmanic-hafs\.woff2'\)/);
  assert.match(fonts, /resolveAssetUrl\(`quran\/hafs\/fonts\/p\$\{page\}\.woff2`\)/);
  assert.match(fonts, /Promise\.allSettled/);
  assert.doesNotMatch(fonts, /getApiBase|\/api\/quran-fonts/);
  assert.doesNotMatch(page, /fontReady \? 'visible' : 'invisible'/);
});

test('teacher recitation attendance reveals grouped actions without a page reload', async () => {
  const [dashboard, evaluation, taskList, recitationAction, recitationDetails, amountVisibility, amountToggle, endSelector, inlineSelect, server, deploymentEnv] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationAction.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/TeacherRecitationDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationAmountVisibility.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationAmountsToggle.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/RecitationEndSelector.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/InlineRecitationSelect.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../.env.nukhab', import.meta.url), 'utf8'),
  ]);

  assert.match(dashboard, /\['manualAttendance', 'students'\]/);
  assert.match(dashboard, /!isSupervisor && section\.key === 'manualAttendance'/);
  assert.doesNotMatch(evaluation, /nazem/i);
  assert.match(evaluation, /teacherAttendanceMode/);
  assert.match(taskList, /placeholder="اختر الحالة"/);
  assert.match(taskList, /label: 'حفظ'/);
  assert.match(taskList, /label: 'مراجعة'/);
  assert.match(taskList, /label: 'ربط'/);
  assert.doesNotMatch(taskList, /label: 'إتقان'/);
  assert.doesNotMatch(taskList, /اكتمل الإتقان|selectedCompletions/);
  assert.match(taskList, /textClassName="whitespace-nowrap break-normal"/);
  assert.match(taskList, /recitation-actions/);
  assert.match(taskList, /<RecitationIdentity name=\{student.studentName\}/);
  assert.match(taskList, /recitation-reference-card/);
  assert.match(taskList, /RecitationAmountVisibility/);
  assert.match(taskList, /TeacherRecitationAction/);
  assert.match(evaluation, /\[showAmounts, setShowAmounts\] = useState\(false\)/);
  assert.doesNotMatch(evaluation, /OfflineRecitationStatus/);
  assert.match(evaluation, /RecitationAmountsToggle/);
  assert.match(evaluation, /DashboardMobileHeaderActions/);
  assert.doesNotMatch(evaluation, /<h2[^>]*>جلسات التسميع<\/h2>/);
  assert.match(amountToggle, /إخفاء جميع المقادير/);
  assert.match(taskList, /visible=\{showAmounts\}/);
  assert.match(taskList, /showAmount=\{showAmounts\}/);
  assert.match(recitationAction, /showAmount && <TeacherRecitationDetails/);
  assert.match(recitationAction, /data-recitation-slot/);
  assert.match(recitationDetails, /className="recitation-amount" dir="rtl"/);
  assert.match(recitationDetails, /maxLines=\{2\}/);
  assert.match(taskList, /const repeatEditable = teacherExecutionMode[\s\S]*executionSources\?\.repeat[\s\S]*action\.key === 'saved'/);
  assert.match(taskList, /showAmounts && firstTask\.taskType === 'memorization' && isCompletedGroup/);
  assert.match(taskList, /<TeacherRecitationPractice repeatControl=/);
  assert.match(recitationDetails, /amountControl \|\| <RecitationAmountVisibility/);
  assert.doesNotMatch(taskList, /label: 'التعويض'|key: 'compensation'/);
  assert.match(taskList, /listeningControl=\{memorizationView\?\.listeningControl\}/);
  assert.match(taskList, /actionOrder = \['saved', 'link', 'review', 'mastery'\]/);
  assert.match(taskList, /if \(!action\.tasks\.length\) return false/);
  assert.match(taskList, /\['teacher', 'both'\]\.includes\(executionSources\[action\.sourceKey\]\)/);
  assert.match(taskList, /hasRecitationTasks && canRecite/);
  assert.match(taskList, /attendanceEditable = Boolean\(onAttendanceChange\)/);
  assert.match(taskList, /attendanceAllowsActions = \['present', 'late'\]\.includes\(student.attendanceStatus\)/);
  assert.match(taskList, /canRecord = Boolean\(readingEntry\) && attendanceAllowsActions/);
  assert.match(taskList, /teacherAttendanceMode && !studentById\.has\(studentId\)/);
  assert.match(taskList, /canRecite = !student.offlineSequenceBlocked && attendanceAllowsActions/);
  assert.match(taskList, /\{mistakeCount\} خطأ/);
  assert.match(taskList, /\{warningCount\} تنبيه/);
  assert.doesNotMatch(taskList, />خطأ \{mistakeCount\}</);
  assert.match(taskList, /\{getQuranTaskLabel\(firstTask\)\}:/);
  assert.match(recitationAction, /className="recitation-action min-w-0 px-2/);
  assert.match(evaluation, /secondaryAction=\{notCompletedAction\}/);
  assert.doesNotMatch(evaluation, /shouldHideStudent/);
  assert.match(evaluation, /recitationPending: !hasRemainingTasks/);
  assert.doesNotMatch(evaluation, /&& \['present', 'late'\]\.includes\(student\.attendanceStatus\)[\s\S]*&& !hasRemainingTasks/);
  assert.doesNotMatch(taskList, /اختر حاضر أو متأخر لفتح مهام التسميع/);
  assert.doesNotMatch(endSelector, /surahs\.length > 1/);
  assert.match(endSelector, /ariaLabel="سورة النهاية"/);
  assert.doesNotMatch(endSelector, /const sameSurah = Number\(start\.surah\)/);
  assert.match(inlineSelect, /!gap-0/);
  assert.match(inlineSelect, /!px-0\.5/);
  assert.match(inlineSelect, /appearance="inline"/);
  assert.doesNotMatch(amountVisibility, /useState|Eye|Button/);
  assert.doesNotMatch(deploymentEnv, /VITE_API_BASE/);
  assert.doesNotMatch(taskList, /student\.committeeName/);
  assert.doesNotMatch(taskList, /bg-background\/70/);
  assert.match(server, /const teacherAttendanceMode = canTeacherSetRecitationAttendance\(settings, req\.auth\.role\)/);
  assert.match(server, /AND t\.task_type IN \('memorization', 'review', 'link'\)/);
  assert.match(server, /if \(\['absent', 'excused'\]\.includes\(attendanceStatus\)\) return teacherAttendanceMode;/);
  assert.match(server, /tasks: rows[\s\S]*?isRecitationAttendanceVisible[\s\S]*?taskQueue: rows/);
  assert.match(server, /if \(!\['present', 'late'\]\.includes\(attendanceStatus\)\) return teacherAttendanceMode;/);
  assert.doesNotMatch(server, /const studentStatusFilter = `AND \(t\.student_status = 'done'/);
  assert.match(server, /attemptCount: Math\.max\(0, Number\(row\.attemptCount \|\| 0\)\)/);
  assert.doesNotMatch(server, /req\.body\.mode === 'recitation_teacher'\s*&&\s*settings\.recitationAttendanceSource/);
});

test('attendance stays unselected until an explicit choice and absence messages follow that choice only', async () => {
  const [server, attendance, settings] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ManualAttendanceSection.jsx', import.meta.url), 'utf8'),
    Promise.all(['SettingsSection.jsx', 'NotificationSettings.jsx'].map(name => readFile(new URL('../src/components/dashboard/' + name, import.meta.url), 'utf8'))).then(parts => parts.join('\n')),
  ]);

  assert.match(attendance, /value=\{row\.status \|\| ''\}/);
  assert.match(attendance, /<SelectValue placeholder="اختر الحالة"/);
  assert.match(settings, /ariaLabel="الإرسال التلقائي لرسالة الغياب"/);
  assert.match(settings, /label="قالب رسالة الغياب"/);
  assert.match(server, /status === 'absent'[\s\S]*notifyStudentGuardianAbsenceOnce/);
  assert.match(server, /message_type = 'absence'[\s\S]*status = 'sent'/);
  assert.doesNotMatch(server, /processAutomaticAbsenceMessages|تسجيل غياب تلقائي/);
  assert.doesNotMatch(server, /COALESCE\(ar\.status, 'absent'\)/);
  assert.match(server, /processAutomaticExecutionMessages[\s\S]*t\.task_type IN \('memorization', 'review', 'link'\)/);
  assert.match(server, /processAutomaticExecutionMessages[\s\S]*COALESCE\(t\.target_pages, 0\) > 0/);
});
