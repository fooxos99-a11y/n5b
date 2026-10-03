import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  OFFLINE_RECITATION_CACHE_DAYS,
  canEditPendingRecitation,
  compareRecitationSessions,
  isUuid,
  normalizeRecitationSessionType,
  recitationSessionTypeForTask,
  normalizeRecitationSession,
  recitationCandidateWins,
  recitationSessionKey,
} from '../shared/offline-recitation.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { hasOfflineRecitationAccountAccess } from '../server/services/dashboardPermissions.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('completed students remain visible after their recitation is saved', async () => {
  for (const state of [{ recitationFinished: true }, { recitationPending: true }]) {
    const evaluation = { date: '2026-09-06', students: [{ studentId: 8, attendanceStatus: 'present', ...state }], tasks: [] };
    assert.deepEqual(mergeCommittedOfflineEvaluation(evaluation).students, evaluation.students);
  }
  const server = await read('../server/index.js');
  const route = server.slice(server.indexOf('const attemptedStudentIds'), server.indexOf('gradingPolicy:', server.indexOf('const attemptedStudentIds')));
  assert.match(route, /\|\| attemptedStudentIds\.has\(Number\(student\.id\)\)/);
  assert.match(route, /recitationFinished: attemptedStudentIds\.has\(Number\(student\.id\)\)/);
});

test('recitation accounts can upload their own offline sessions without an administrative permission', () => {
  assert.equal(hasOfflineRecitationAccountAccess('supervisor', '/offline-recitation/batch'), true);
  assert.equal(hasOfflineRecitationAccountAccess('reciter', '/offline-recitation/bootstrap'), true);
  assert.equal(hasOfflineRecitationAccountAccess('admin', '/offline-recitation/status'), true);
  assert.equal(hasOfflineRecitationAccountAccess('student', '/offline-recitation/batch'), false);
});

test('fresh server evaluation overrides synced offline attendance and keeps retries actionable', () => {
  const base = {
    date: '2026-09-03',
    students: [{ studentId: 8, attendanceStatus: 'present' }],
    tasks: [{ id: 156082, studentId: 8 }],
  };
  const syncedSession = {
    status: 'synced', sessionDate: base.date, tasks: [{ taskId: 156082 }],
  };
  const syncedAttendance = {
    status: 'synced', actionType: 'student_attendance',
    payload: { studentId: 8, date: base.date, status: 'absent' },
  };
  const authoritative = mergeCommittedOfflineEvaluation(base, [syncedSession], [syncedAttendance]);
  assert.deepEqual(authoritative.tasks.map((task) => task.id), [156082]);
  assert.equal(authoritative.students[0].attendanceStatus, 'present');

  const pending = mergeCommittedOfflineEvaluation(base, [{ ...syncedSession, status: 'pending' }], []);
  assert.deepEqual(pending.tasks, []);
  assert.equal(pending.students[0].studentId, 8);
  assert.equal(pending.students[0].recitationPending, true);
  assert.equal(pending.students[0].recitationFinished, false);
});

test('fresh server absence is not replaced by an old synced local attendance action', () => {
  const evaluation = {
    date: '2026-09-03',
    students: [{ studentId: 16, attendanceStatus: 'absent' }],
    tasks: [{ id: 1, studentId: 16 }],
  };
  const oldLocalAttendance = {
    status: 'synced', actionType: 'student_attendance',
    payload: { studentId: 16, date: evaluation.date, status: 'present' },
  };
  const merged = mergeCommittedOfflineEvaluation(evaluation, [], [oldLocalAttendance]);
  assert.deepEqual(merged.students, []);
});

test('an overdue task waits for fresh server authority instead of promoting a cached next amount', () => {
  const taskQueue = [
    { id: 1, studentId: 8, planId: 17, taskType: 'memorization', taskDate: '2026-08-31' },
    { id: 2, studentId: 8, planId: 17, taskType: 'memorization', taskDate: '2026-09-01' },
    { id: 3, studentId: 8, planId: 17, taskType: 'memorization', taskDate: '2026-09-03' },
  ];
  const evaluation = {
    date: '2026-09-03',
    students: [{ studentId: 8, attendanceStatus: 'present' }],
    tasks: [taskQueue[0]],
    taskQueue,
  };
  const advanced = advanceRecitationTaskQueue(evaluation, [taskQueue[0]]);
  assert.deepEqual(advanced.tasks.map((task) => task.id), []);

  const awaitingServer = advanceRecitationTaskQueue(evaluation, [taskQueue[0]], { promote: false });
  assert.deepEqual(awaitingServer.tasks, []);

  const merged = mergeCommittedOfflineEvaluation(evaluation, [{
    status: 'pending',
    studentId: 8,
    sessionDate: evaluation.date,
    tasks: [{ taskId: 1, payload: { offlineOutcome: { completed: true } } }],
  }], []);
  assert.deepEqual(merged.tasks.map((task) => task.id), []);
  assert.equal(merged.students[0].recitationPending, true);
  assert.equal(merged.students[0].recitationFinished, false);
});

test('a failed local absence remains hidden until its delivery can retry', () => {
  const evaluation = {
    date: '2026-09-03',
    students: [{ studentId: 16, attendanceStatus: '' }],
    tasks: [{ id: 1, studentId: 16 }],
  };
  const failedAttendance = {
    status: 'failed',
    actionType: 'student_attendance',
    payload: { studentId: 16, date: evaluation.date, status: 'absent' },
  };
  const merged = mergeCommittedOfflineEvaluation(evaluation, [], [failedAttendance]);
  assert.deepEqual(merged.students, []);
});

test('offline recitation contracts normalize sessions and keep a 14-day cache window', () => {
  const session = normalizeRecitationSession({
    sessionId: '018f47f0-a321-7a2f-8abc-1234567890ab',
    studentId: '12',
    supervisorId: '3',
    deviceId: '018f47f0-a321-7a2f-8abc-1234567890ac',
    sessionDate: '2026-08-24',
    status: 'pending',
    sessionType: 'mastery',
    tasks: [{ taskId: 9 }],
  });
  assert.equal(OFFLINE_RECITATION_CACHE_DAYS, 14);
  assert.equal(isUuid(session.sessionId), true);
  assert.equal(session.studentId, 12);
  assert.equal(session.sessionType, 'mastery');
  assert.equal(recitationSessionKey(session), '12:2026-08-24:mastery');
  assert.equal(normalizeRecitationSessionType('review'), 'review');
  assert.equal(recitationSessionTypeForTask({ taskType: 'memorization', taskDate: '2026-09-01' }), 'memorization');
  assert.equal(normalizeRecitationSessionType('memorization:2026-09-01'), 'general');
  assert.equal(canEditPendingRecitation('pending'), true);
  assert.equal(canEditPendingRecitation('synced'), false);
});

test('pending sessions are ordered per student by day before upload', () => {
  const rows = [
    { sessionDate: '2026-08-25', committedAtLocal: '2026-08-25T08:00:00Z', sessionId: 'b' },
    { sessionDate: '2026-08-24', committedAtLocal: '2026-08-24T09:00:00Z', sessionId: 'a' },
  ].sort(compareRecitationSessions);
  assert.deepEqual(rows.map((row) => row.sessionDate), ['2026-08-24', '2026-08-25']);
});

test('trusted earliest event wins independently from upload order', () => {
  const first = {
    sessionId: '018f47f0-a321-7a2f-8abc-1234567890aa',
    eventAt: '2026-08-24 08:00:00.000',
    trusted: true,
  };
  const second = {
    sessionId: '018f47f0-a321-7a2f-8abc-1234567890bb',
    eventAt: '2026-08-24 09:00:00.000',
    trusted: true,
  };
  assert.equal(recitationCandidateWins(first, second), true);
  assert.equal(recitationCandidateWins(second, first), false);
  assert.equal(recitationCandidateWins(first, { ...first, trusted: false }), true);
});

test('server enforces one daily slot with device ownership, audit, and plan versions', async () => {
  const [migration, integrityMigration, service, server, routes] = await Promise.all([
    read('../server/migrations/2026.08.24.4-offline-recitation.js'),
    read('../server/migrations/2026.08.24.5-offline-recitation-integrity.js'),
    read('../server/services/offlineRecitation.js'),
    read('../server/index.js'),
    read('../server/routes/offlineRecitationRoutes.js'),
  ]);
  assert.match(migration, /PRIMARY KEY \(student_id, session_date, session_type\)/);
  assert.match(migration, /student_quran_recitation_audit_log/);
  assert.match(migration, /plan_version/);
  assert.match(integrityMigration, /is_official/);
  assert.match(service, /recitationSessionTypeForTask\(task\)/);
  assert.match(integrityMigration, /current_plan_version/);
  assert.match(service, /actor_role AS actorRole, actor_id AS actorId/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /rejected_duplicate/);
  assert.doesNotMatch(server, /code: 'INVALID_PLAN_VERSION'/);
  assert.match(server, /sessionClaim\.sessionId/);
  assert.match(server, /offline-recitation\/batch/);
  assert.match(server, /ownOfflineRecitationAccess = hasOfflineRecitationAccountAccess\(req\.auth\.role, path\)/);
  assert.match(server, /ownRecitationPreferencesAccess \|\| ownOfflineRecitationAccess/);
  assert.doesNotMatch(server, /path\.startsWith\('\/offline-recitation'\)\) return \['quranEvaluation'\]/);
  assert.match(service, /superseded_by_earlier_session/);
  assert.match(service, /DATE_FORMAT\(slot\.accepted_event_at/);
  assert.match(routes, /DATE_ADD\(\?, INTERVAL \? DAY\)/);
  assert.doesNotMatch(routes, /nazem/i);
});

test('client persists atomically, restores drafts, retries globally, and never blocks logout', async () => {
  const [store, sync, merge, bridge, evaluation, taskList, mushaf, accountPortal, dashboard, auth, config] = await Promise.all([
    read('../src/services/offlineRecitationStore.js'),
    read('../src/services/offlineRecitationService.js'),
    read('../src/lib/offlineEvaluationMerge.js'),
    read('../src/components/native/OfflineRecitationSyncBridge.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/components/portal/MushafRecitationDialog.jsx'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/authSession.js'),
    read('../capacitor.config.json'),
  ]);
  assert.match(store, /beginTransaction\(\)/);
  assert.match(store, /rollbackTransaction/);
  assert.match(store, /indexedDB\.open/);
  assert.match(sync, /RETRY_DELAYS_MS/);
  assert.match(sync, /syncOfflineRecitationBatch/);
  assert.match(sync, /OFFLINE_RECITATION_MAX_BATCH/);
  assert.match(sync, /offlineSequenceBlocked/);
  assert.match(sync, /offlineOutcome/);
  assert.doesNotMatch(sync, /nazem/i);
  assert.doesNotMatch(taskList, /ناظم|سيُعتمد تلقائيًا/);
  assert.match(sync, /commitOfflineAttendance/);
  assert.match(sync, /mergeCommittedOfflineEvaluation/);
  assert.match(merge, /advanceRecitationTaskQueue/);
  assert.match(merge, /\{ promote: canAdvanceRecitationSession\(session\) \}/);
  assert.match(merge, /LOCAL_ATTENDANCE_STATUSES = new Set\(\['pending', 'syncing', 'failed'\]\)/);
  assert.match(merge, /latestAttendanceByStudent/);
  assert.match(merge, /LOCAL_ATTENDANCE_STATUSES\.has\(action\.status\)/);
  assert.match(merge, /\['absent', 'excused'\]\.includes\(student\.attendanceStatus\)/);
  assert.match(merge, /filter\(\(student\) => student.canSetAttendance \|\| !\['absent', 'excused'\]\.includes\(student\.attendanceStatus\)\)/);
  assert.match(evaluation, /useTeacherEvaluationData\(/);
  const evaluationLoader = await read('../src/hooks/useTeacherEvaluationData.js');
  assert.match(evaluationLoader, /resolvedEvaluation = await mergeOfflineReading\(supervisorId, await mergeLocalTeacherEvaluation\(supervisorId, evaluation\)\)/);
  assert.match(evaluationLoader, /update\(\{ data: resolvedEvaluation/);
  assert.match(sync, /if \(!queuedSyncs\.has\(actorKey\)\)/);
  assert.match(sync, /queuedSyncs\.delete\(actorKey\); return syncOfflineRecitations\(supervisorId, \{ force: true \}\)/);
  assert.match(sync, /if \(force\) pendingStatuses\.push\('rejected_permission'\)/);
  assert.match(bridge, /networkStatusChange/);
  assert.match(bridge, /appStateChange/);
  assert.match(evaluation, /commitOfflineRecitation/);
  assert.match(evaluation, /evaluateMemorization\(gradingPolicy, \{ faces: \[\{ mistakes, warnings, hesitations \}\] \}\)/);
  assert.match(evaluation, /offlineOutcome\(task, payload, data\?\.gradingPolicy\)/);
  assert.doesNotMatch(evaluation, /calculateRecitationScore|evaluationPolicies/);
  assert.doesNotMatch(taskList, /لا يمكن تحديد مقدار اليوم بدقة قبل المزامنة/);
  assert.match(evaluation, /syncRecitationInBackground/);
  assert.match(evaluation, /title: 'تعذر اعتماد التسميع'/);
  assert.match(evaluation, /evaluation\.taskQueue \|\| evaluation\.tasks/);
  assert.doesNotMatch(evaluation, /promote: taskPayloads\.every/);
  assert.match(sync, /\[404, 409, 422\][\s\S]*return 'conflict'/);
  assert.match(sync, /status === 'conflict'[\s\S]*\? null/);
  assert.match(evaluation, /description: 'حُفظت النتيجة.'/);
  assert.doesNotMatch(evaluation, /ستُرسل تلقائيًا|ناظم/);
  assert.doesNotMatch(mushaf, /ناظم|ستُرسل تلقائيًا|getNazemDeliveryFailure/);
  assert.match(evaluation, /RECITATION_FAILED_LABEL/);
  assert.match(await read('../shared/recitation-fail.js'), /RECITATION_FAILED_LABEL = 'راسب'/);
  assert.match(evaluation, /secondaryAction=\{notCompletedAction\}/);
  assert.match(taskList, /hasRecitationTasks && canRecite/);
  assert.match(taskList, /!student\.offlineSequenceBlocked/);
  assert.match(evaluation, /notMemorized: true/);
  assert.match(mushaf, /getRecitationDraft/);
  assert.doesNotMatch(accountPortal, /OfflineLogoutDialog|getOfflineRecitationSummary/);
  assert.doesNotMatch(dashboard, /OfflineLogoutDialog|getOfflineRecitationSummary/);
  assert.match(accountPortal, /const logout = useAccountLogout\(\)/);
  assert.match(dashboard, /const logout = useAccountLogout\(\)/);
  const logout = await read('../src/hooks/useAccountLogout.js');
  assert.match(logout, /const completion = studentsApi.logout\(\);[\s\S]*navigate\('\/login'/);
  assert.doesNotMatch(logout, /await completion|await studentsApi.logout/);
  assert.match(auth, /SecureStorage/);
  assert.match(config, /"androidIsEncryption": true/);
  assert.match(config, /"BackgroundRunner"/);
});

test('authorized teachers keep absent and excused pupils visible during offline delivery', () => {
  for (const status of ['absent', 'excused']) {
    const evaluation = { date: '2026-09-30', students: [{ studentId: 16, canSetAttendance: true, attendanceStatus: 'present' }], tasks: [{ id: 1, studentId: 16 }] };
    const actions = [{ status: 'pending', actionType: 'student_attendance', payload: { studentId: 16, date: evaluation.date, status } }];
    const result = mergeCommittedOfflineEvaluation(evaluation, [], actions);
    assert.equal(result.students[0].attendanceStatus, status);
    assert.deepEqual(result.tasks, []);
    assert.equal(mergeCommittedOfflineEvaluation({ ...evaluation, students: [{ studentId: 16, canSetAttendance: false }] }, [], actions).students.length, 0);
  }
});
