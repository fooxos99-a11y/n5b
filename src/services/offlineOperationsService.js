import { singleFlight, limitedTaskQueue } from '@/lib/asyncRequests';
import { createRefreshGate } from '@/lib/refreshGate';
import { getAuthSessionVersion } from '@/lib/authSession';
import { studentsApi } from '@/services/studentsApi';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';

const ACTION_HANDLERS = Object.freeze({
  self_reading: payload => studentsApi.saveSupervisorReading(payload.supervisorId, payload),
  student_attendance: (payload) => studentsApi.checkInStudent(payload.studentId, payload),
  staff_attendance: (payload) => studentsApi.checkInMyStaffAttendance(payload),
  narration_part: (payload) => studentsApi.updateNarrationPart(payload.eventId, payload.partId, {
    ...payload.evaluation,
    requestId: payload.requestId,
    deviceId: payload.deviceId,
    bootId: payload.bootId,
    eventMonotonicMs: payload.eventMonotonicMs,
    committedAtLocal: payload.committedAtLocal,
  }),
  narration_juz: (payload) => studentsApi.updateNarrationJuz(payload.eventId, payload.entryId, payload.juzNumber, {
    ...payload.evaluation,
    requestId: payload.requestId,
    deviceId: payload.deviceId,
    bootId: payload.bootId,
    eventMonotonicMs: payload.eventMonotonicMs,
    committedAtLocal: payload.committedAtLocal,
  }),
  narration_student_status: (payload) => studentsApi.updateNarrationStudentStatus(
    payload.eventId,
    payload.entryId,
    payload.status,
    payload,
  ),
  store_purchase: (payload) => studentsApi.purchaseStoreProduct(payload.productId, payload),
});

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const registerBackgroundSync = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  await registration?.sync?.register?.('nukhab-offline-operations').catch(() => undefined);
};

export const offlineActorKey = (accountId, actorRole = 'supervisor') => (
  `${getTenantRegistrationNumber() || 'default'}:${String(actorRole || 'supervisor')}:${Number(accountId || 0)}`
);

const refreshManagementWorkspace = createRefreshGate(5 * 60_000);
const fetchSnapshot = singleFlight(async (key, _session, loader) => {
  const value = await loader();
  await offlineRecitationStore.cacheSnapshot(key, value);
  return value;
}, (key, session) => JSON.stringify([key, session]));

export async function loadOfflineSnapshot(accountId, resourceKey, loader, {
  actorRole = 'supervisor',
  preferCache = false,
  onRefresh,
} = {}) {
  const key = `${offlineActorKey(accountId, actorRole)}:resource:${resourceKey}`;
  const cached = await offlineRecitationStore.getSnapshot(key);
  if (!isOnline()) {
    if (cached !== null && cached !== undefined) return cached;
    throw new Error('هذه البيانات غير محفوظة للعمل دون إنترنت. اتصل بالإنترنت مرة واحدة أولًا.');
  }
  if (preferCache && cached !== null && cached !== undefined) {
    void fetchSnapshot(key, getAuthSessionVersion(), loader).then((value) => {
      onRefresh?.(value);
    }).catch(() => undefined);
    return cached;
  }
  try {
    return await fetchSnapshot(key, getAuthSessionVersion(), loader);
  } catch (error) {
    if (cached !== null && cached !== undefined) return cached;
    throw error;
  }
}

export async function commitOfflineOperation(accountId, actionType, payload, { dedupeKey = '', actorRole = 'supervisor' } = {}) {
  if (!ACTION_HANDLERS[actionType]) throw new Error('نوع العملية المحلية غير مدعوم.');
  const session = getAuthSessionVersion();
  if (session !== getAuthSessionVersion()) throw new Error('تغير الحساب؛ أعد تنفيذ الأمر.');
  const device = await offlineRecitationStore.getDeviceContext(offlineActorKey(accountId, actorRole));
  const capturedAtLocal = new Date().toISOString();
  const action = await offlineRecitationStore.commitAction(
    offlineActorKey(accountId, actorRole),
    actionType,
    {
      ...payload,
      deviceId: device.deviceId,
      bootId: device.bootId,
      eventMonotonicMs: device.monotonicMs,
      capturedAtLocal,
      committedAtLocal: capturedAtLocal,
      registrationNumber: getTenantRegistrationNumber(),
    },
    { dedupeKey },
  );
  void registerBackgroundSync();
  return action;
}

export async function syncOfflineActions(accountId, { force = false, actorRole = 'supervisor' } = {}) {
  if (!accountId || !isOnline()) return [];
  const actorKey = offlineActorKey(accountId, actorRole);
  const actions = await offlineRecitationStore.getActions(actorKey, ['pending', 'failed', 'syncing']);
  const results = [];
  for (const action of actions) {
    if (!force && action.nextRetryAt && Date.parse(action.nextRetryAt) > Date.now()) continue;
    const handler = ACTION_HANDLERS[action.actionType];
    if (!handler) continue;
    await offlineRecitationStore.updateAction(actorKey, action.actionId, { status: 'syncing', lastError: '' });
    try {
      const result = await handler(action.payload);
      await cacheSyncedStaffAttendance(action, result, actorKey);
      results.push(await offlineRecitationStore.updateAction(actorKey, action.actionId, {
        status: 'synced', result, nextRetryAt: null, lastError: '',
      }));
      await offlineRecitationStore.setMeta(`last_sync:${actorKey}`, new Date().toISOString());
    } catch (error) {
      const retryCount = Number(action.retryCount || 0) + 1;
      const terminal = Number(error?.status) >= 400
        && Number(error?.status) < 500
        && ![408, 429].includes(Number(error?.status));
      const _resolveStatus = () => {
        if (error?.status === 403) {
          return 'rejected_permission';
        }
        if (error?.status === 409) {
          return 'rejected_conflict';
        }
        if (terminal) {
          return 'rejected_validation';
        }
        return 'failed';
      };
      results.push(await offlineRecitationStore.updateAction(actorKey, action.actionId, {
        status: _resolveStatus(),
        retryCount,
        nextRetryAt: terminal ? null : new Date(Date.now() + Math.min(60 * 60_000, 5_000 * (3 ** retryCount))).toISOString(),
        lastError: error.message || 'تعذرت المزامنة.',
      }));
    }
  }
  return results;
}

/** Refresh the attendance cache only when the synchronized record is at least as recent as the cached date. */
async function cacheSyncedStaffAttendance(action, result, actorKey) {
  if (action.actionType === 'staff_attendance' && result?.date) {
    const key = `${actorKey}:resource:staff-attendance:me`;
    const cached = await offlineRecitationStore.getSnapshot(key);
    if (!cached?.date || result.date >= cached.date) {
      await offlineRecitationStore.cacheSnapshot(key, result);
    }
  }
}

export async function prefetchOfflineWorkspace(accountId) {
  if (!accountId || !isOnline()) return;
  const date = getBusinessDate();
  const cache = (key, loader) => loadOfflineSnapshot(accountId, key, loader);
  const reportTo = date;
  const reportFrom = shiftDateOnly(date, -369);
  const [eventsResult] = await Promise.allSettled([
    cache('narration:events', () => studentsApi.getNarrationEvents()),
    cache('staff-attendance:me', () => studentsApi.getMyStaffAttendance()),
    cache('narration:committees', () => studentsApi.getCommittees()),
    cache('plans:rows:all', () => studentsApi.getStudentPlans({ committeeId: 'all' })),
    cache('quran:chapters', () => studentsApi.getQuranChapters()),
    cache('quran:juz-ranges', () => studentsApi.getQuranJuzRanges()),
    cache('settings:public', () => studentsApi.getPublicSettings()),
    cache('reports:recitation-sessions', () => studentsApi.getRecitationSessionsReport({ from: reportFrom, to: reportTo })),
  ]);
  const events = eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value) ? eventsResult.value : [];
  const openEvent = events.find((item) => item.status === 'open');
  const event = openEvent
    ? await cache(`narration:event:${openEvent.id}`, () => studentsApi.getNarrationEvent(openEvent.id)).catch(() => null)
    : null;
  const detailJobs = [];
  if (event) {
    for (const student of event.students || []) {
      for (const part of student.parts || []) {
        detailJobs.push(cache(
          `narration:ayahs:${event.id}:${part.id}`,
          () => studentsApi.getNarrationPartAyahs(event.id, part.id),
        ));
      }
    }
  }
  await Promise.allSettled(detailJobs);
}

export async function prefetchOfflineManagementWorkspace(accountId, actorRole = 'manager', { automatic = false } = {}) {
  if (!accountId || !isOnline()) return;
  const date = getBusinessDate();
  const cache = limitedTaskQueue(
    (key, loader) => loadOfflineSnapshot(accountId, key, loader, { actorRole }),
    (key) => key,
    2,
  );
  if (automatic) {
    const scope = JSON.stringify([offlineActorKey(accountId, actorRole), getAuthSessionVersion(), date]);
    return refreshManagementWorkspace(scope, () => cache('management:committees', () => studentsApi.getCommittees()));
  }
  const [familiesResult, archivesResult, committeesResult] = await Promise.allSettled([
    cache('management:families:', () => studentsApi.getFamilies()),
    cache('reports:archives', () => studentsApi.getReportArchives()),
    cache('management:committees', () => studentsApi.getCommittees()),
    cache('management:students:all', () => studentsApi.getStudents({ committeeId: 'all' })),
    cache('reports:committees', () => studentsApi.getCommittees()),
    cache(`reports:students:${date}:${date}:all`, () => studentsApi.getProgressReport({
      from: date, to: date, committeeId: 'all', studentId: 'all',
    })),
    cache(`reports:overview::${date}`, () => studentsApi.getOverviewReport()),
    cache(`reports:supervisors:${date}`, () => studentsApi.getSupervisorReport({ date })),
  ]);
  const families = familiesResult.status === 'fulfilled' && Array.isArray(familiesResult.value)
    ? familiesResult.value
    : [];
  const archives = archivesResult.status === 'fulfilled' && Array.isArray(archivesResult.value)
    ? archivesResult.value
    : [];
  const committees = committeesResult.status === 'fulfilled' && Array.isArray(committeesResult.value)
    ? committeesResult.value
    : [];
  await Promise.allSettled([
    ...committees.map((committee) => cache(
      `management:students:${committee.id}`,
      () => studentsApi.getStudents({ committeeId: committee.id }),
    )),
    ...families.map((family) => cache(
      `management:family-students:${family.id}`,
      () => studentsApi.getFamilyStudents(family.id),
    )),
    ...archives.slice(0, 10).map((archive) => cache(
      `reports:archive:${archive.id}`,
      () => studentsApi.getReportArchive(archive.id),
    )),
  ]);
  await offlineRecitationStore.setMeta(
    `offline_prepared_at:${offlineActorKey(accountId, actorRole)}`,
    new Date().toISOString(),
  );
}


export async function mergeOfflineReading(accountId, evaluation) {
  if (!evaluation) return evaluation;
  const actions = await offlineRecitationStore.getActions(offlineActorKey(accountId), ['pending', 'failed', 'syncing']);
  const pending = new Map(actions.filter(action => action.actionType === 'self_reading' && action.payload.date === evaluation.date)
    .map(action => [Number(action.payload.studentId), action.payload]));
  return { ...evaluation, reading: (evaluation.reading || []).map(row => {
    const payload = pending.get(Number(row.studentId));
    return payload ? { ...row, status: payload.completed === null ? null : payload.completed ? 'read' : 'missed', recordedFaces: payload.faces, pendingSync: true } : row;
  }) };
}
