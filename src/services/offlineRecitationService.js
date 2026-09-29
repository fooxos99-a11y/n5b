import { mergeRecitationTaskResults } from '../lib/recitationTaskResults.js';
import {
  OFFLINE_RECITATION_MAX_BATCH,
  compareRecitationSessions,
  createUuid,
  recitationSessionTypeForTask,
} from '../../shared/offline-recitation.js';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../shared/business-date.js';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import {
  commitOfflineOperation,
  prefetchOfflineWorkspace,
  syncOfflineActions,
} from '@/services/offlineOperationsService';
import { mergeCommittedOfflineEvaluation } from '@/lib/offlineEvaluationMerge';
import { limitedTaskQueue } from '@/lib/asyncRequests';
import { getAuthSessionVersion } from '@/lib/authSession';
import { migrateLegacyRecitationDevice } from '@/lib/recitationDeviceIdentity';
import { recitationTaskCacheVersion, selectRecitationPrefetchTasks, supportsIndividualSyncFallback } from '@/lib/recitationPrefetchPolicy';

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const activeSyncs = new Map();
const activeWorkspacePreparations = new Map();
const queuedSyncs = new Map();
const prefetchCooldowns = new Map();
const automaticPreparationTimes = new Map();

const recitationActorKey = (supervisorId) => (
  `${getTenantRegistrationNumber() || 'default'}:supervisor:${Number(supervisorId || 0)}`
);

const nextRetryAt = (retryCount) => new Date(
  Date.now() + RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)],
).toISOString();

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const dateInTimezone = getBusinessDate;

const sessionType = (task) => (
  task?.taskType === 'memorization' && task?.track === 'mastery' ? 'mastery' : String(task?.taskType || 'general')
);

const registerWebBackgroundSync = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  await registration?.sync?.register?.('nukhab-offline-operations').catch(() => undefined);
};

const errorStatus = (error) => {
  if (error?.data?.code === 'REJECTED_DUPLICATE') return 'rejected_duplicate';
  if (error?.data?.code === 'INVALID_PLAN_VERSION') return 'conflict';
  if (error?.status === 401 || error?.status === 403
    || /الصلاحية|صاحب الحساب/.test(String(error?.message || ''))) return 'rejected_permission';
  if ([404, 409, 422].includes(Number(error?.status))) return 'conflict';
  return 'failed';
};

export async function bootstrapOfflineRecitation(supervisorId) {
  const actorKey = recitationActorKey(supervisorId);
  const authVersion = getAuthSessionVersion();
  const device = await offlineRecitationStore.getDeviceContext(actorKey);
  if (authVersion !== getAuthSessionVersion()) throw new Error('تغير الحساب أثناء تجهيز الجلسة.');
  const bootstrap = await studentsApi.bootstrapOfflineRecitation({ ...device, prepareFutureTasks: false });
  if (authVersion !== getAuthSessionVersion()) throw new Error('تغير الحساب أثناء تجهيز الجلسة.');
  await Promise.all([
    offlineRecitationStore.cacheSnapshot(`${actorKey}:bootstrap`, bootstrap),
    offlineRecitationStore.setMeta(`time_anchor:${actorKey}`, bootstrap.timeAnchor),
  ]);
  void prefetchRecitationTasks(supervisorId, bootstrap.tasks || [], { automatic: true, date: dateInTimezone(Date.now()) });
  void studentsApi.getSupervisorQuranEvaluation(supervisorId)
    .then((evaluation) => authVersion === getAuthSessionVersion() ? cacheTeacherEvaluation(supervisorId, evaluation) : undefined)
    .catch(() => undefined);
  return bootstrap;
}

export async function prepareOfflineRecitationWorkspace(supervisorId, { automatic = false } = {}) {
  if (!supervisorId) throw new Error('حساب المعلم غير محدد.');
  if (!isOnline()) throw new Error('اتصل بالإنترنت لتجهيز بيانات الحلقة أولًا.');
  const actorKey = recitationActorKey(supervisorId);
  const authVersion = getAuthSessionVersion();
  const preparationKey = `${actorKey}:${getAuthSessionVersion()}:${dateInTimezone(Date.now())}:${automatic}`;
  if (activeWorkspacePreparations.has(preparationKey)) return activeWorkspacePreparations.get(preparationKey);
  if (automatic && Date.now() - (automaticPreparationTimes.get(preparationKey) || 0) < 5 * 60_000) return null;
  if (automatic) {
    if (automaticPreparationTimes.size > 100) automaticPreparationTimes.clear();
    automaticPreparationTimes.set(preparationKey, Date.now());
  }
  const preparation = (async () => {
    const device = await offlineRecitationStore.getDeviceContext(actorKey);
    if (authVersion !== getAuthSessionVersion()) throw new Error('تغير الحساب أثناء تجهيز الجلسة.');
    const [bootstrap, evaluation] = await Promise.all([
      studentsApi.bootstrapOfflineRecitation({ ...device, prepareFutureTasks: !automatic }),
      studentsApi.getSupervisorQuranEvaluation(supervisorId),
    ]);
    if (authVersion !== getAuthSessionVersion()) throw new Error('تغير الحساب أثناء تجهيز الجلسة.');
    const tasks = [...new Map(
      [...(bootstrap.tasks || []), ...(evaluation.taskQueue || evaluation.tasks || [])]
        .map((task) => [Number(task.id), task]),
    ).values()];
    const preparedAt = new Date().toISOString();
    await Promise.all([
      offlineRecitationStore.cacheSnapshot(`${actorKey}:bootstrap`, bootstrap),
      offlineRecitationStore.setMeta(`time_anchor:${actorKey}`, bootstrap.timeAnchor),
      cacheTeacherEvaluation(supervisorId, evaluation),
      prefetchRecitationTasks(supervisorId, tasks, { automatic, date: evaluation.date }),
    ]);
    if (!automatic) {
      if (authVersion !== getAuthSessionVersion()) throw new Error('تغير الحساب أثناء تجهيز الجلسة.');
      await prefetchOfflineWorkspace(supervisorId);
      await offlineRecitationStore.setMeta(`offline_prepared_at:${actorKey}`, preparedAt);
    }
    return {
      preparedAt,
      studentCount: Array.isArray(evaluation.students) ? evaluation.students.length : 0,
      taskCount: tasks.length,
    };
  })();
  activeWorkspacePreparations.set(preparationKey, preparation);
  try {
    return await preparation;
  } finally {
    activeWorkspacePreparations.delete(preparationKey);
  }
}

export async function cacheTeacherEvaluation(supervisorId, evaluation) {
  const actorKey = recitationActorKey(supervisorId);
  await offlineRecitationStore.cacheSnapshot(actorKey, evaluation);
  return evaluation;
}

export async function mergeLocalTeacherEvaluation(supervisorId, evaluation) {
  const actorKey = recitationActorKey(supervisorId);
  const [sessions, actions] = await Promise.all([
    offlineRecitationStore.getSessions(actorKey),
    offlineRecitationStore.getActions(actorKey),
  ]);
  return mergeCommittedOfflineEvaluation(evaluation, sessions, actions);
}

export async function getCachedTeacherEvaluation(supervisorId) {
  const actorKey = recitationActorKey(supervisorId);
  const [base, bootstrap, anchor, sessions, actions] = await Promise.all([
    offlineRecitationStore.getSnapshot(actorKey),
    offlineRecitationStore.getSnapshot(`${actorKey}:bootstrap`),
    offlineRecitationStore.getMeta(`time_anchor:${actorKey}`),
    offlineRecitationStore.getSessions(actorKey),
    offlineRecitationStore.getActions(actorKey),
  ]);
  if (!base) return base;
  const currentEvaluation = mergeCommittedOfflineEvaluation(base, sessions, actions);
  if (!bootstrap || !anchor) return currentEvaluation;
  const elapsed = Date.now() - Number(anchor.deviceEpochMs || 0);
  const maxElapsed = (Number(bootstrap.cacheDays || 14) + 1) * 24 * 60 * 60 * 1000;
  const trustedEnough = Number.isFinite(elapsed) && elapsed >= -5 * 60_000 && elapsed <= maxElapsed;
  const date = trustedEnough
    ? dateInTimezone(Number(anchor.serverEpochMs || Date.parse(bootstrap.serverTime)) + elapsed)
    : base.date;
  if (!date || date <= base.date) return currentEvaluation;

  const students = (bootstrap.students || []).map((student) => {
    const baseStudent = base.students?.find((item) => (
      Number(item.studentId) === Number(student.studentId)
    ));
    const attendance = [...actions].reverse().find((action) => (
      action.actionType === 'student_attendance'
      && Number(action.payload?.studentId) === Number(student.studentId)
      && action.payload?.date === date
    ));
    return {
      ...student,
      attendanceStatus: attendance?.payload?.status || '',
      canSetAttendance: Boolean(baseStudent?.canSetAttendance),
      offlineSequenceBlocked: !trustedEnough,
    };
  });
  const studentById = new Map(students.map((student) => [Number(student.studentId), student]));
  const usableSessions = sessions.filter((session) => (
    ['pending', 'syncing', 'synced', 'failed'].includes(session.status) && session.sessionDate < date
  ));
  const cachedTasks = (bootstrap.tasks || [])
    .filter((task) => ['memorization', 'review', 'link'].includes(task.taskType))
    .map((task) => ({
      ...task,
      studentName: studentById.get(Number(task.studentId))?.studentName || '',
    }));
  const currentTasks = [];
  const keys = new Set(cachedTasks.map((task) => `${task.studentId}:${sessionType(task)}`));
  collectCurrentOfflineTasks({ keys, studentById, cachedTasks, date, base, trustedEnough, usableSessions, currentTasks });
  return {
    ...base,
    date,
    students,
    tasks: currentTasks,
    offline: true,
    offlineTimeUntrusted: !trustedEnough,
  };
}

/** Resolve cached task groups without skipping unconfirmed prior recitations. */
function collectCurrentOfflineTasks({ keys, studentById, cachedTasks, date, base, trustedEnough, usableSessions, currentTasks }) {
  for (const key of keys) {
    const [rawStudentId, type] = key.split(':');
    const studentId = Number(rawStudentId);
    const history = cachedTasks.filter((task) => (
      Number(task.studentId) === studentId && sessionType(task) === type && task.taskDate < date
    ));
    const due = cachedTasks.filter((task) => (
      Number(task.studentId) === studentId && sessionType(task) === type && task.taskDate === date
      && Number(task.teacherCompleted) !== 1
    ));
    const unresolvedDates = [...new Set(history
      .filter((task) => task.taskDate >= base.date && Number(task.teacherCompleted) !== 1)
      .map((task) => task.taskDate))].sort((a, b) => a.localeCompare(b));
    const { blocked, carry } = resolveOfflineCarry({ unresolvedDates, history, usableSessions, studentId, type, blocked: !trustedEnough });
    const student = studentById.get(studentId);
    if (blocked && student) student.offlineSequenceBlocked = true;
    if (!blocked) currentTasks.push(...(carry || due));
  }
}

/** Require complete recorded outcomes for every earlier group before carrying work forward. */
function resolveOfflineCarry({ unresolvedDates, history, usableSessions, studentId, type, blocked }) {
  let carry = null;
  for (const taskDate of unresolvedDates) {
    const group = history.filter((task) => task.taskDate === taskDate);
    const groupIds = new Set(group.map((task) => Number(task.id)));
    const latest = usableSessions
      .filter((session) => (
        Number(session.studentId) === studentId
        && session.sessionType === type
        && session.tasks?.some((item) => groupIds.has(Number(item.taskId)))
      ))
      .sort(compareRecitationSessions)
      .at(-1);
    if (!latest) {
      blocked = true;
      break;
    }
    const outcomes = latest.tasks
      .filter((item) => groupIds.has(Number(item.taskId)))
      .map((item) => item.payload?.offlineOutcome);
    if (outcomes.length !== group.length || outcomes.some((outcome) => !outcome)) {
      blocked = true;
      break;
    }
    carry = outcomes.every((outcome) => outcome.completed) ? null : group;
  }
  return { blocked, carry };
}

export async function loadCachedTaskData(supervisorId, task, { preferCache = false } = {}) {
  const actorKey = recitationActorKey(supervisorId);
  const cached = await offlineRecitationStore.getTask(actorKey, task.id);
  if (cached && (!isOnline() || preferCache)) return cached;
  try {
    const payload = await studentsApi.getSupervisorQuranTaskAyahs(supervisorId, task.id);
    await offlineRecitationStore.cacheTask(actorKey, task.id, payload);
    return payload;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

const prefetchTask = limitedTaskQueue(
  async (supervisorId, task, actorKey, sessionVersion) => {
    if (sessionVersion !== getAuthSessionVersion() || actorKey !== recitationActorKey(supervisorId)) return;
    const key = JSON.stringify([actorKey, sessionVersion, task.id]);
    const accountCooldown = `${actorKey}:${sessionVersion}:rate-limit`;
    if (Date.now() < Math.max(prefetchCooldowns.get(key) || 0, prefetchCooldowns.get(accountCooldown) || 0)) {
      throw new Error('تعذر تجهيز بعض المهام مؤقتًا. أعد المحاولة بعد قليل.');
    }
    const cached = await offlineRecitationStore.getTask(actorKey, task.id);
    if (sessionVersion !== getAuthSessionVersion()) return;
    const version = recitationTaskCacheVersion(task);
    if (cached?._prefetchVersion === version && Date.now() - cached._prefetchedAt < 5 * 60_000) return;
    try {
      const payload = await studentsApi.getSupervisorQuranTaskAyahs(supervisorId, task.id);
      if (sessionVersion !== getAuthSessionVersion()) return;
      await offlineRecitationStore.cacheTask(actorKey, task.id, { ...payload, _prefetchVersion: version, _prefetchedAt: Date.now() });
    } catch (error) {
      if (prefetchCooldowns.size >= 2_000) prefetchCooldowns.clear();
      prefetchCooldowns.set(key, Date.now() + Math.max(Number(error.retryAfterMs) || 0, 5 * 60_000));
      if (error.status === 429) prefetchCooldowns.set(accountCooldown, Date.now() + Math.max(Number(error.retryAfterMs) || 0, 60_000));
      throw error;
    }
  },
  (_supervisorId, task, actorKey, sessionVersion) => JSON.stringify([actorKey, sessionVersion, Number(task.id)]),
  4,
);

export async function prefetchRecitationTasks(supervisorId, tasks = [], options = {}) {
  if (!isOnline()) return;
  if (options.automatic && (document.visibilityState !== 'visible'
    || !window.location.pathname.endsWith('/recitation-sessions'))) return;
  const actorKey = recitationActorKey(supervisorId);
  const sessionVersion = getAuthSessionVersion();
  const uniqueTasks = selectRecitationPrefetchTasks(tasks, options);
  const results = await Promise.allSettled(uniqueTasks.map((task) => prefetchTask(supervisorId, task, actorKey, sessionVersion)));
  if (!options.automatic && results.some((result) => result.status === 'rejected')) {
    throw new Error('تعذر تجهيز بعض مهام التسميع للعمل دون اتصال. البيانات المحفوظة باقية؛ أعد المحاولة بعد قليل.');
  }
}

export async function saveRecitationDraft(supervisorId, studentId, payload) {
  return offlineRecitationStore.saveDraft(recitationActorKey(supervisorId), studentId, payload);
}

export async function getRecitationDraft(supervisorId, studentId) {
  return offlineRecitationStore.getDraft(recitationActorKey(supervisorId), studentId);
}

export async function commitOfflineRecitation({
  supervisorId,
  studentId,
  sessionDate,
  tasks,
}) {
  const version = getAuthSessionVersion();
  if (version !== getAuthSessionVersion()) throw new Error('تغير الحساب؛ أعد حفظ التقييم.');
  const actorKey = recitationActorKey(supervisorId);
  const device = await offlineRecitationStore.getDeviceContext(actorKey);
  const now = new Date().toISOString();
  const sessionId = createUuid();
  const session = await offlineRecitationStore.commitSession(actorKey, {
    sessionId,
    studentId,
    supervisorId,
    sessionDate,
    sessionType: recitationSessionTypeForTask(tasks[0]?.task),
    deviceId: device.deviceId,
    registrationNumber: getTenantRegistrationNumber(),
    createdAtLocal: now,
    committedAtLocal: now,
    tasks: tasks.map(({ task, payload }) => ({
      taskId: Number(task.id),
      taskType: task.taskType,
      taskDate: task.taskDate,
      track: task.track,
      planId: Number(task.planId || 0),
      planVersion: Math.max(1, Number(task.planVersion || 1)),
      payload,
      synced: false,
      result: null,
    })),
  });
  void registerWebBackgroundSync();
  return session;
}

export async function commitOfflineAttendance({ supervisorId, studentId, date, status }) {
  const action = await commitOfflineOperation(supervisorId, 'student_attendance', {
    studentId: Number(studentId),
    date,
    status,
    mode: 'recitation_teacher',
  }, { dedupeKey: `student-attendance:${studentId}:${date}` });
  void registerWebBackgroundSync();
  if (isOnline()) void syncOfflineRecitations(supervisorId, { force: true });
  return action;
}

async function syncSession(supervisorId, actorKey, session) {
  const now = Date.now();
  if (session.nextRetryAt && Date.parse(session.nextRetryAt) > now) return session;
  const syncing = await offlineRecitationStore.updateSession(actorKey, session.sessionId, {
    status: 'syncing',
    lastError: '',
  });
  try {
    const tasks = [...syncing.tasks];
    for (const [index, item] of syncing.tasks.entries()) {
      if (item.synced) {
        continue;
      }
      const result = await studentsApi.rateSupervisorQuranTask(supervisorId, item.taskId, {
        ...item.payload,
        requestId: `${syncing.sessionId}:${item.taskId}`,
        sessionId: syncing.sessionId,
        date: syncing.sessionDate,
        deviceId: syncing.deviceId,
        bootId: syncing.bootId,
        eventMonotonicMs: syncing.eventMonotonicMs,
        createdAtLocal: syncing.createdAtLocal,
        committedAtLocal: syncing.committedAtLocal,
        planVersion: item.planVersion,
        planSnapshot: { planId: item.planId, planVersion: item.planVersion },
      });
      tasks[index] = { ...item, synced: true, syncResultCode: 'accepted', result };
      await offlineRecitationStore.updateSession(actorKey, syncing.sessionId, { tasks });
    }
    const completed = await offlineRecitationStore.updateSession(actorKey, syncing.sessionId, {
      status: 'synced',
      tasks,
      retryCount: syncing.retryCount,
      nextRetryAt: null,
      lastError: '',
    });
    await offlineRecitationStore.setMeta(`last_sync:${actorKey}`, new Date().toISOString());
    return completed;
  } catch (error) {
    const status = errorStatus(error);
    const terminal = status.startsWith('rejected_') || status === 'conflict';
    const resolved = await offlineRecitationStore.updateSession(actorKey, syncing.sessionId, {
      status,
      retryCount: Number(syncing.retryCount || 0) + 1,
      nextRetryAt: terminal ? null : nextRetryAt(Number(syncing.retryCount || 0)),
      lastError: error.message || 'تعذرت المزامنة.',
    });
    if (terminal) return resolved;
    throw error;
  }
}

export function syncOfflineRecitations(supervisorId, { force = false } = {}) {
  const actorKey = recitationActorKey(supervisorId);
  if (!supervisorId || !isOnline()) return Promise.resolve([]);
  if (activeSyncs.has(actorKey)) {
    const active = activeSyncs.get(actorKey);
    if (!force) return active;
    if (!queuedSyncs.has(actorKey)) {
      queuedSyncs.set(actorKey, active.catch(() => undefined)
        .then(() => { queuedSyncs.delete(actorKey); return syncOfflineRecitations(supervisorId, { force: true }); }));
    }
    return queuedSyncs.get(actorKey);
  }
  const promise = (async () => {
    const results = [];
    await migrateLegacyRecitationDevice(offlineRecitationStore, actorKey);
    results.push(...await syncOfflineActions(supervisorId, { force }));
    const pendingStatuses = ['pending', 'failed', 'invalid_sequence', 'syncing'];
    if (force) pendingStatuses.push('rejected_permission');
    const pending = (await offlineRecitationStore.getSessions(
      actorKey,
      pendingStatuses,
    )).sort(compareRecitationSessions);
    const ready = pending.filter((session) => (
      force || !session.nextRetryAt || Date.parse(session.nextRetryAt) <= Date.now()
    ));
    const blockedStudentIds = new Set();
    for (let offset = 0; offset < ready.length; offset += OFFLINE_RECITATION_MAX_BATCH) {
      const batch = ready.slice(offset, offset + OFFLINE_RECITATION_MAX_BATCH)
        .filter((session) => !blockedStudentIds.has(Number(session.studentId)));
      if (!batch.length) continue;
      const resolvedSessionIds = new Set();
      try {
        const response = await studentsApi.syncOfflineRecitationBatch(batch);
        const outcomeById = new Map((response.results || []).map((item) => [item.sessionId, item]));
        if (batch.some((session) => !outcomeById.has(session.sessionId))) throw new Error('لم يرجع السيرفر نتيجة الجلسة.');
        await applyOfflineBatchOutcomes({ batch, outcomeById, actorKey, results, resolvedSessionIds, blockedStudentIds });
        await offlineRecitationStore.setMeta(`last_sync:${actorKey}`, new Date().toISOString());
      } catch (error) {
        if (!supportsIndividualSyncFallback(error)) {
          await recordOfflineBatchFailure(batch, resolvedSessionIds, results, actorKey, error);
          break;
        }
        // Compatibility fallback also preserves per-student ordering on servers without batch sync.
        await syncOfflineBatchIndividually(batch, results, supervisorId, actorKey, force);
      }
    }
    return results;
  })().finally(() => activeSyncs.delete(actorKey));
  activeSyncs.set(actorKey, promise);
  return promise;
}

/** Use the legacy endpoint in order and stop later sessions for a student after a failure. */
async function syncOfflineBatchIndividually(batch, results, supervisorId, actorKey, force) {
  const blockedStudents = new Set();
  for (const session of batch) {
    if (blockedStudents.has(Number(session.studentId))) continue;
    try {
      results.push(await syncSession(supervisorId, actorKey, force ? { ...session, nextRetryAt: null } : session));
    } catch {
      blockedStudents.add(Number(session.studentId));
    }
  }
}

/** Record unresolved sessions for retry without overwriting outcomes already persisted. */
async function recordOfflineBatchFailure(batch, resolvedSessionIds, results, actorKey, error) {
  for (const session of batch) {
    if (resolvedSessionIds.has(session.sessionId)) continue;
    const retryCount = Number(session.retryCount || 0) + 1;
    results.push(await offlineRecitationStore.updateSession(actorKey, session.sessionId, {
      status: 'failed', retryCount,
      nextRetryAt: new Date(Math.max(Date.parse(nextRetryAt(retryCount)), Date.now() + (Number(error.retryAfterMs) || 0))).toISOString(),
      lastError: error.message || 'تعذرت مزامنة الجلسة.',
    }));
  }
}

/** Persist each batch outcome and block later sessions when student ordering cannot be guaranteed. */
async function applyOfflineBatchOutcomes({ batch, outcomeById, actorKey, results, resolvedSessionIds, blockedStudentIds }) {
  for (const session of batch) {
    const outcome = outcomeById.get(session.sessionId);
    if (!outcome) throw new Error('لم يرجع السيرفر نتيجة الجلسة.');
    const tasks = mergeRecitationTaskResults(session.tasks, outcome.tasks);
    if (['accepted', 'already_synced'].includes(outcome.result)
      && tasks.length && tasks.every((item) => item.synced && item.result?.ok === true)) {
      const completed = await offlineRecitationStore.updateSession(actorKey, session.sessionId, {
        status: 'synced', tasks, nextRetryAt: null, lastError: '',
      });
      results.push(completed);
      resolvedSessionIds.add(session.sessionId);
      continue;
    }
    const _resolveStatus = () => {
      if (outcome.result === 'rejected_duplicate') {
        return 'rejected_duplicate';
      }
      if (outcome.result === 'rejected_permission') {
        return 'rejected_permission';
      }
      if (outcome.result === 'invalid_sequence') {
        return 'invalid_sequence';
      }
      if (outcome.result === 'conflict') {
        return 'conflict';
      }
      return 'failed';
    };
    const status = _resolveStatus();
    const retryCount = Number(session.retryCount || 0) + 1;
    const resolved = await offlineRecitationStore.updateSession(actorKey, session.sessionId, {
      status,
      tasks,
      retryCount,
      nextRetryAt: status.startsWith('rejected_') || status === 'conflict'
        ? null
        : nextRetryAt(retryCount),
      lastError: outcome.tasks?.find((item) => item.message)?.message || 'تعذرت مزامنة الجلسة.',
    });
    results.push(resolved);
    resolvedSessionIds.add(session.sessionId);
    if (['failed', 'invalid_sequence', 'conflict', 'rejected_permission'].includes(status)) blockedStudentIds.add(Number(session.studentId));
  }
}

export async function getOfflineRecitationSummary(supervisorId) {
  return offlineRecitationStore.getSummary(recitationActorKey(supervisorId));
}
