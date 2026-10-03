import { Capacitor } from '@capacitor/core';
import { isDeferredMutation, isDashboardUndoActive, deferredActions } from '@/lib/deferredActions';
import { clearAuthSession, getAuthSessionVersion, getBearerToken } from '@/lib/authSession';
import {
  apiBase,
  clearTenantApiBase,
  clearTenantRegistrationNumber,
  getApiBase,
  getTenantRegistrationNumber,
  setTenantApiBase,
  setTenantRegistrationNumber,
} from '@/services/apiBase';
import { prepareTimedRequest, requestTimeoutMessage } from '@/lib/requestTimeout';
import { createRequestCooldown } from '@/lib/requestCooldown';
import { singleFlight, refreshableSingleFlight } from '@/lib/asyncRequests';

const PUBLIC_RANKINGS_CACHE_VERSION = '2026-08-25-empty-state';
let pendingLogout = null;
const requestCooldown = createRequestCooldown({ storage: {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
} });
const requestScopeKey = (value) => JSON.stringify([getApiBase(), getTenantRegistrationNumber(), getAuthSessionVersion(), value]);
const loadTaskAyahs = singleFlight((supervisorId, taskId) => request(`/supervisors/${supervisorId}/quran-evaluation/${taskId}/ayahs`),
  (supervisorId, taskId) => requestScopeKey([supervisorId, taskId]));
const loadStudentToday = singleFlight((studentId) => request(`/students/${studentId}/quran-today`),
  studentId => requestScopeKey(['student-today', studentId]));
const chapterCache = new Map();
const loadChapters = singleFlight(async () => {
  const key = requestScopeKey('chapters');
  const cached = chapterCache.get(key);
  if (cached && Date.now() < cached.expires) return cached.data;
  const data = await request('/quran/chapters');
  chapterCache.clear();
  chapterCache.set(key, { data, expires: Date.now() + 3_600_000 });
  return data;
}, () => requestScopeKey('chapters'));
const loadTeacherEvaluation = refreshableSingleFlight(
  (supervisorId) => request(`/supervisors/${supervisorId}/quran-evaluation`, { timeoutMs: 60_000 }),
  (supervisorId) => JSON.stringify([getApiBase(), getTenantRegistrationNumber(), getAuthSessionVersion(), String(supervisorId)]),
);

const roleHeader = async () => {
  const registrationNumber = getTenantRegistrationNumber();
  const native = Capacitor.isNativePlatform();
  const token = await getBearerToken();
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
    'X-Registration-Number': registrationNumber,
    'X-Nukhab-Native': native ? '1' : '0',
  };
};

async function fetchRequest(path, options, captureUndo, requestBase) {
  const { apiBaseOverride, authSnapshot, ...requestOptions } = options;
  requestCooldown.check(requestBase, path);
  const traceId = globalThis.crypto?.randomUUID?.() || '';
  const timedRequest = prepareTimedRequest(requestOptions);
  try {
    return await fetch(`${apiBaseOverride || getApiBase()}${path}`, {
      ...timedRequest.options,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...await (authSnapshot || roleHeader()),
        ...(options.headers),
        ...(captureUndo ? { 'X-Dashboard-Undo': '1' } : {}),
        ...(traceId ? { 'X-Request-Id': traceId } : {}),
      },
    });
  } catch (error) {
    if (timedRequest.didTimeOut()) {
      const timeoutError = new Error(requestTimeoutMessage, { cause: error });
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.requestId = traceId;
      if (traceId) timeoutError.message += ` رقم المتابعة: ${traceId}`;
      throw timeoutError;
    }
    throw error;
  } finally {
    timedRequest.cleanup();
  }
}

function registerRequestUndo(response, { path, options, sessionVersion, requestBase, apiBaseOverride }) {
  const value = response.headers?.get('X-Dashboard-Undo');
  let undo;
  try { undo = value ? JSON.parse(value) : null; } catch { undo = null; }
  if (undo?.id && /^[a-f0-9]{64}$/.test(undo.id)) {
    const sourcePage = globalThis.location?.href;
    deferredActions.register(options.method === 'DELETE' ? 'حُذف العنصر' : 'حُفظت التغييرات', async () => {
      if (sessionVersion !== getAuthSessionVersion() || requestBase !== (apiBaseOverride || getApiBase())) throw new Error('تغير الحساب؛ لا يمكن التراجع من حساب آخر.');
      await request(`/dashboard-undo/${undo.id}`, { method: 'POST', body: '{}' });
      globalThis.dispatchEvent(new CustomEvent('dashboard-undo-completed', { detail: { path, sourcePage } }));
    }, Number(undo.durationMs || 0));
  }
}

export async function request(path, options = {}) {
  const { apiBaseOverride, authSnapshot } = options;
  const sessionVersion = getAuthSessionVersion();
  const requestBase = apiBaseOverride || getApiBase();
  const captureUndo = isDashboardUndoActive() && !authSnapshot && isDeferredMutation(path, options);
  const fetchOnce = () => fetchRequest(path, options, captureUndo, requestBase);

  let response = await fetchOnce();
  if (response.status === 401 && path !== '/auth/login' && !authSnapshot
    && sessionVersion === getAuthSessionVersion()) response = await fetchOnce();

  requestCooldown.record(requestBase, response);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !authSnapshot && sessionVersion === getAuthSessionVersion()) {
      clearTenantApiBase();
      clearTenantRegistrationNumber();
      await clearAuthSession();
      localStorage.removeItem('wajeh_role');
      localStorage.removeItem('wajeh_student_id');
      localStorage.removeItem('wajeh_supervisor_id');
      localStorage.removeItem('wajeh_name');
      localStorage.removeItem('wajeh_account_id');
      localStorage.removeItem('wajeh_dashboard_permissions');
    }
    const error = new Error(data?.message || 'تعذر تنفيذ الطلب.');
    error.data = data;
    error.status = response.status;
    error.requestId = response.headers?.get('X-Request-Id') || data?.requestId || '';
    const retryAfter = response.headers?.get('Retry-After');
    const _resolveConditional = () => {
      if (retryAfter) {
        return Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : Date.parse(retryAfter) - Date.now());
      }
      return 0;
    };
    error.retryAfterMs = _resolveConditional();
    if (error.requestId && response.status >= 500) error.message += ` رقم المتابعة: ${error.requestId}`;
    throw error;
  }
  if (captureUndo && sessionVersion === getAuthSessionVersion() && isDashboardUndoActive()) {
    registerRequestUndo(response, { path, options, sessionVersion, requestBase, apiBaseOverride });
  }
  return data;
}

async function requestFile(path, options = {}) {
  const { apiBaseOverride, ...requestOptions } = options;
  const timedRequest = prepareTimedRequest(requestOptions, 60_000);
  let response;
  try {
    response = await fetch(`${apiBaseOverride || getApiBase()}${path}`, {
      ...timedRequest.options,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...await roleHeader(),
        ...(options.headers),
      },
    });
  } catch (error) {
    if (timedRequest.didTimeOut()) throw new Error(requestTimeoutMessage, { cause: error });
    throw error;
  } finally {
    timedRequest.cleanup();
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || 'تعذر تحميل الملف.');
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const encodedName = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  const plainName = /filename="([^"]+)"/.exec(disposition)?.[1];
  return {
    blob: await response.blob(),
    filename: encodedName ? decodeURIComponent(encodedName) : (plainName || 'report'),
  };
}

export const studentsApi = {
  login: async ({ loginNumber, password }) => {
    // A previous logout response must never clear the cookie of a new login.
    if (pendingLogout) await pendingLogout;
    clearTenantApiBase();
    clearTenantRegistrationNumber();
    const user = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginNumber, password }),
      apiBaseOverride: apiBase,
    });
    setTenantRegistrationNumber(user.complex?.registrationNumber || '');
    if (user.apiBase) setTenantApiBase(user.apiBase);
    return user;
  },
  logout: () => {
    if (pendingLogout) return pendingLogout;
    const authSnapshot = roleHeader();
    const context = { apiBaseOverride: getApiBase(), authSnapshot, keepalive: true };
    const native = Capacitor.isNativePlatform();
    const localCleanup = clearAuthSession({ afterTokenRead: authSnapshot });
    for (const key of ['wajeh_role', 'wajeh_student_id', 'wajeh_supervisor_id',
      'wajeh_name', 'wajeh_account_id', 'wajeh_dashboard_permissions']) localStorage.removeItem(key);
    clearTenantApiBase();
    clearTenantRegistrationNumber();
    pendingLogout = Promise.allSettled([localCleanup, (async () => {
      try {
        if (native) {
          const { unregisterDeviceNotifications } = await import('@/services/nativeNotifications');
          await unregisterDeviceNotifications({
            unregisterDevice: (payload) => request('/notifications/devices', {
              ...context, method: 'DELETE', body: JSON.stringify(payload),
            }),
          });
        }
      } finally {
        await request('/auth/logout', { ...context, method: 'POST', body: '{}' });
      }
    })()]).then((results) => {
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    }).finally(() => { pendingLogout = null; });
    return pendingLogout;
  },
  getCallRooms: () => request('/calls'),
  getPushStatus: () => request('/notifications/push-status'),
  registerNotificationDevice: (payload) => request('/notifications/devices', { method: 'POST', body: JSON.stringify(payload) }),
  unregisterNotificationDevice: (payload) => request('/notifications/devices', { method: 'DELETE', body: JSON.stringify(payload) }),
  getReportCommittees: () => request('/reports/committees'),
  getNotifications: () => request('/notifications'),
  markNotificationsRead: (ids) => request('/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) }),
  getNotificationAudience: () => request('/notification-management/audience'),
  getNotificationHistory: () => request('/notification-management'),
  getNotificationRecipients: (id) => request(`/notification-management/${id}/recipients`),
  sendNotification: (payload) => request('/notification-management', { method: 'POST', body: JSON.stringify(payload) }),
  getStudentNotifications: () => request('/student-notifications'),
  markStudentNotificationRead: (notificationId) => request(`/student-notifications/${notificationId}/read`, { method: 'POST', body: JSON.stringify({}) }),
  createCallRoom: (payload) => request('/calls', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getCallToken: (roomId) => request(`/calls/${roomId}/token`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  leaveCallRoom: (roomId) => request(`/calls/${roomId}/leave`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  closeCallRoom: (roomId) => request(`/calls/${roomId}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  getNarrationEvents: () => request('/narration-events'),
  getNarrationPreparation: () => request('/narration-events/preparation'),
  previewNarrationRanges: (ranges) => request('/narration-events/preview-ranges', { method: 'POST', body: JSON.stringify({ ranges }) }),
  getNarrationEvent: (eventId) => request(`/narration-events/${eventId}`),
  getNarrationPartAyahs: (eventId, partId) => request(`/narration-events/${eventId}/parts/${partId}/ayahs`),
  deleteNarrationEvent: (eventId) => request(`/narration-events/${eventId}`, { method: 'DELETE' }),
  createNarrationEvent: (payload) => request('/narration-events', { method: 'POST', body: JSON.stringify(payload) }),
  updateNarrationJuz: (eventId, entryId, juzNumber, payload) => request(`/narration-events/${eventId}/students/${entryId}/juz/${juzNumber}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateNarrationPart: (eventId, partId, payload) => request(`/narration-events/${eventId}/parts/${partId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateNarrationStudentStatus: (eventId, entryId, status, metadata = {}) => request(`/narration-events/${eventId}/students/${entryId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ ...metadata, status }),
  }),
  archiveNarrationEvent: (eventId, payload = {}) => request(`/narration-events/${eventId}/archive`, { method: 'POST', body: JSON.stringify(payload) }),
  sendNarrationMessage: (eventId, payload) => request(`/narration-events/${eventId}/send`, { method: 'POST', body: JSON.stringify(payload) }),
  getSettings: () => request('/settings'),
  getExecutionReminderStudents: () => request('/settings/execution-reminder-students'),
  getPublicSettings: () => request('/public-settings'),
  getMyDashboardPermissions: () => request('/dashboard-permissions/me'),
  getDashboardBootstrap: () => request('/dashboard-bootstrap'),
  getMyAccountDeletionRequest: () => request('/account-deletion/me'),
  requestAccountDeletion: () => request('/account-deletion', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  cancelAccountDeletion: () => request('/account-deletion', {
    method: 'DELETE',
  }),
  getAccountDeletionRequests: () => request('/account-deletion/requests'),
  updateAccountDeletionRequest: (requestId, payload) => request(`/account-deletion/requests/${requestId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  getDashboardPermissions: () => request('/dashboard-permissions'),
  updateSupervisorDashboardPermissions: (supervisorId, permissions) =>
    request(`/dashboard-permissions/${supervisorId}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
  updateSettings: (payload) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  resetAllPoints: (confirmText) =>
    request('/settings/reset-points', {
      method: 'POST',
      body: JSON.stringify({ confirmText }),
    }),
  deleteProgramData: (confirmText) =>
    request('/settings/delete-program-data', {
      method: 'POST',
      body: JSON.stringify({ confirmText }),
    }),
  endTerm: (confirmText) =>
    request('/settings/end-term', {
      method: 'POST',
      body: JSON.stringify({ confirmText }),
    }),
  getHomepageStats: () => request('/homepage-stats'),
  getCommittees: () => request('/committees'),
  getPublicRegistration: (registrationNumber = '') => request(
    `/registration/public${registrationNumber ? '?registrationNumber=' + encodeURIComponent(registrationNumber) : ''}`,
    { headers: { 'X-Registration-Number': registrationNumber } },
  ),
  submitPublicRegistration: (payload, registrationNumber = '') =>
    request('/registration/public', {
      method: 'POST',
      headers: { 'X-Registration-Number': registrationNumber },
      body: JSON.stringify({ ...payload, registrationNumber }),
    }),
  getRegistrationRequests: () => request('/registration-requests'),
  updateRegistrationConfig: (payload) =>
    request('/registration-requests/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  preliminaryAcceptRegistrationRequest: (id) =>
    request(`/registration-requests/${id}/preliminary-accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  rejectRegistrationRequest: (id) =>
    request(`/registration-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  acceptRegistrationRequest: (id, payload) =>
    request(`/registration-requests/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getQuranChapters: loadChapters,
  getQuranAyahs: (surah) => request(`/quran/ayahs?surah=${encodeURIComponent(surah)}`),
  getQuranJuzRanges: () => request('/quran/juz-ranges'),
  getStudentPlanPreferences: () => request('/student-plans/preferences'),
  getStudentPlanPause: () => request('/student-plans/pause'),
  setStudentPlanPause: ({ paused, revision }) => request('/student-plans/pause', {
    method: 'PUT', body: JSON.stringify({ paused, revision }),
  }),
  getStudentPlans: ({ committeeId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (committeeId) params.set('committeeId', committeeId);
    return request(`/student-plans?${params.toString()}`);
  },
  saveStudentPlan: (studentId, payload) =>
    request(`/student-plans/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  closeStudentPlan: (studentId, planId) => request(`/student-plans/${studentId}/close`, { method: 'POST', body: JSON.stringify({ planId }) }),
  deleteStudentPlan: (studentId) => request(`/student-plans/${studentId}`, { method: 'DELETE' }),
  deleteStudentPriorMemorization: (studentId, payload) =>
    request(`/student-plans/${studentId}/prior-memorization`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  getFamilies: ({ search = '' } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    return request(`/families?${params.toString()}`);
  },
  createFamily: (payload) =>
    request('/families', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFamily: (id, payload) =>
    request(`/families/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteFamily: (id) =>
    request(`/families/${id}`, {
      method: 'DELETE',
    }),
  getFamilyStudents: (id) => request(`/families/${id}/students`),
  awardStudentPoints: (studentId, payload) =>
    request(`/students/${studentId}/points/award`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTeacherPointStudents: () => request('/teacher-points/students'),
  adjustTeacherStudentPoints: (payload) => request('/teacher-points/adjustments', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getFamilyRankings: () => request(`/rankings/families?_fresh=${PUBLIC_RANKINGS_CACHE_VERSION}`),
  getComplexRankings: () => request(`/rankings/complexes?_fresh=${PUBLIC_RANKINGS_CACHE_VERSION}`),
  getStudentRankings: ({ committeeId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (committeeId) params.set('committeeId', committeeId);
    params.set('_fresh', PUBLIC_RANKINGS_CACHE_VERSION);
    return request(`/rankings/students?${params.toString()}`);
  },
  getStoreProducts: () => request('/store/products'),
  getStoreConfiguration: () => request('/store/configuration'),
  updateStoreConfiguration: (payload) => request('/store/configuration', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  createStoreProduct: (payload) => request('/store/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateStoreProduct: (id, payload) => request(`/store/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  setStoreProductActive: (id, isActive) => request(`/store/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  }),
  removeStoreProduct: (id) => request(`/store/products/${id}`, { method: 'DELETE' }),
  decideStoreOrder: (id, status) => request(`/store/orders/${id}/decision`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getStoreOrders: () => request('/store/orders'),
  setStoreOrderFulfilled: (id, fulfilled) => request(`/store/orders/${id}/fulfilled`, {
    method: 'PATCH',
    body: JSON.stringify({ fulfilled }),
  }),
  deleteStoreOrder: (id) => request(`/store/orders/${id}`, { method: 'DELETE' }),
  purchaseStoreProduct: (productId, payload = {}) => request('/store/purchase', {
    method: 'POST',
    body: JSON.stringify({ productId, ...payload }),
  }),
  getSupervisors: ({ search = '' } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    return request(`/supervisors?${params.toString()}`);
  },
  createSupervisor: (payload) =>
    request('/supervisors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSupervisor: (id, payload) =>
    request(`/supervisors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteSupervisor: (id) =>
    request(`/supervisors/${id}`, {
      method: 'DELETE',
    }),
  getAdministrators: () => request('/administrators'),
  createAdministrator: (payload) =>
    request('/administrators', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdministrator: (id, payload) =>
    request(`/administrators/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteAdministrator: (id) =>
    request(`/administrators/${id}`, {
      method: 'DELETE',
    }),
  getStudents: ({ committeeId = 'all', search = '' } = {}) => {
    const params = new URLSearchParams();
    if (committeeId) params.set('committeeId', committeeId);
    if (search) params.set('search', search);
    return request(`/students?${params.toString()}`);
  },
  sendWhatsAppMessages: (payload) =>
    request('/whatsapp/send', {
      method: 'POST',
      timeoutMs: 0,
      body: JSON.stringify(payload),
    }),
  getWhatsAppStatus: () => request('/whatsapp/status'),
  disconnectWhatsApp: () =>
    request('/whatsapp/disconnect', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getStudent: (id) => request(`/students/${id}`),
  createStudent: (payload) =>
    request('/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createStudentsBulk: (students) =>
    request('/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  updateStudent: (id, payload) =>
    request(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteStudent: (id) =>
    request(`/students/${id}`, {
      method: 'DELETE',
    }),
  moveStudent: (id, committeeId) =>
    request(`/students/${id}/committee`, {
      method: 'PATCH',
      body: JSON.stringify({ committeeId }),
    }),
  getNotificationAdministrators: () => request('/settings/notification-administrators'),
  getStudentQuranToday: loadStudentToday,
  getStudentQuranSessions: (studentId) => request(`/students/${studentId}/quran-sessions`),
  getStudentPlanOverview: (studentId) => request(`/students/${studentId}/quran-sessions?view=plan&includePoints=1`),
  getStudentPlanDays: (studentId) => request(`/students/${studentId}/quran-sessions?view=plan`),
  getStudentQuranSaved: (studentId) => request(`/students/${studentId}/quran-saved`),
  getStudentQuranLevel: (studentId) => request(`/students/${studentId}/quran-level`),
  getStudentQuranReviewHistory: (studentId) => request(`/students/${studentId}/quran-review-history`),
  exportStudentQuranReviewHistory: (studentId) => requestFile(`/students/${studentId}/quran-review-history/export`),
  updateStudentQuranTask: (studentId, taskId, status, payload = {}) =>
    request(`/students/${studentId}/quran-tasks/${taskId}/execution`, {
      method: 'POST',
      body: JSON.stringify({ status, ...payload }),
    }),
  updateStudentQuranTasksExecution: (studentId, payload) =>
    request(`/students/${studentId}/quran-tasks/execution`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  getSupervisorQuranEvaluation: loadTeacherEvaluation,
  saveSupervisorReading: (supervisorId, payload) =>
    request(`/supervisors/${supervisorId}/quran-evaluation/reading`, {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    }),
  prepareSupervisorQuranRange: (supervisorId, taskId, payload) =>
    request(`/supervisors/${supervisorId}/quran-evaluation/${taskId}/range`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  getSupervisorQuranTaskAyahs: loadTaskAyahs,
  getQuranCompensations: (supervisorId, { studentId, date } = {}) =>
    request(`/supervisors/${supervisorId}/quran-compensations?studentId=${encodeURIComponent(studentId || '')}${date ? `&date=${encodeURIComponent(date)}` : ''}`),
  createQuranCompensation: (supervisorId, payload) =>
    request(`/supervisors/${supervisorId}/quran-compensations`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  rateSupervisorQuranTask: (supervisorId, taskId, payload) =>
    request(`/supervisors/${supervisorId}/quran-evaluation/${taskId}`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  bootstrapOfflineRecitation: (payload) =>
    request('/offline-recitation/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  getOfflineRecitationStatus: (sessionIds) =>
    request('/offline-recitation/status', {
      method: 'POST',
      body: JSON.stringify({ sessionIds: Array.isArray(sessionIds) ? sessionIds : [] }),
    }),
  syncOfflineRecitationBatch: (sessions) =>
    request('/offline-recitation/batch', {
      method: 'POST',
      body: JSON.stringify({ sessions: Array.isArray(sessions) ? sessions : [] }),
    }),
  getRecords: (studentId) => request(`/students/${studentId}/records`),
  getAttendanceStatus: ({ role, id }) => {
    const params = new URLSearchParams({ role, id: String(id || '') });
    return request(`/attendance/status?${params.toString()}`);
  },
  checkInStudent: (studentId, payload) =>
    request(`/students/${studentId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { date: payload } : payload || {}),
    }),
  markStudentAbsent: (studentId, payload) =>
    request(`/students/${studentId}/absence`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { date: payload } : payload || {}),
    }),
  checkInSupervisor: (supervisorId, payload) =>
    request(`/supervisors/${supervisorId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { date: payload } : payload || {}),
    }),
  markSupervisorAbsent: (supervisorId, payload) =>
    request(`/supervisors/${supervisorId}/absence`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { date: payload } : payload || {}),
    }),
  getMyStaffAttendance: () => request('/staff-attendance/me'),
  checkInMyStaffAttendance: (payload) => request('/staff-attendance/me', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  }),
  getMyRecitationPreferences: () => request('/recitation-preferences/me'),
  updateMyRecitationPreferences: (payload) => request('/recitation-preferences/me', {
    method: 'PUT',
    body: JSON.stringify(payload || {}),
  }),
  getStudentReport: ({ date, committeeId = 'all' }) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (committeeId) params.set('committeeId', committeeId);
    return request(`/reports/students?${params.toString()}`);
  },
  getSupervisorReport: ({ date, from, to, staffId } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (staffId) params.set('staffId', staffId);
    return request(`/reports/supervisors?${params.toString()}`);
  },
  getRecitationSessionDates: ({ from, to }) => {
    const params = new URLSearchParams({ from, to });
    return request(`/reports/recitation-session-dates?${params.toString()}`);
  },
  getOverviewReport: ({ date, from, to, committeeId = 'all', complexId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('committeeId', committeeId);
    params.set('complexId', complexId);
    return request(`/reports/overview?${params.toString()}`);
  },
  getProgressReport: ({ from, to, committeeId = 'all', studentId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    if (studentId) params.set('studentId', studentId);
    return request(`/reports/progress?${params.toString()}`);
  },
  getReportStudents: () => request('/reports/students'),
  getStudentRecitationHistory: (studentId) => request(`/reports/student-recitation-history?${new URLSearchParams({ studentId: String(studentId) })}`),
  getRecitationSessionsReport: ({ from, to, committeeId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    return request(`/reports/recitation-sessions?${params.toString()}`);
  },
  getStudentSavedReport: ({ from, to, committeeId = 'all', studentId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    if (studentId) params.set('studentId', studentId);
    return request(`/reports/student-saved?${params.toString()}`);
  },
  getReportArchives: () => request('/reports/archives'),
  getReportArchive: (archiveId) => request(`/reports/archives/${archiveId}`),
  deleteReportArchive: (archiveId) =>
    request(`/reports/archives/${archiveId}`, {
      method: 'DELETE',
    }),
  exportProgressReport: ({ from, to, committeeId = 'all', studentId = 'all', format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    if (studentId) params.set('studentId', studentId);
    params.set('format', format);
    return requestFile(`/reports/progress/export?${params.toString()}`);
  },
  exportOverviewReport: ({ from, to, committeeId = 'all', format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('format', format);
    params.set('committeeId', committeeId);
    return requestFile(`/reports/overview/export?${params.toString()}`);
  },
  exportSupervisorReport: ({ date, from, to, staffId, format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (staffId) params.set('staffId', staffId);
    params.set('format', format);
    return requestFile(`/reports/supervisors/export?${params.toString()}`);
  },
  exportArchiveReport: ({ archiveId, committeeId = 'all', format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (committeeId) params.set('committeeId', committeeId);
    params.set('format', format);
    return requestFile(`/reports/archives/${archiveId}/export?${params.toString()}`);
  },
  exportRecitationSessionsReport: ({ from, to, committeeId = 'all', format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    params.set('format', format);
    return requestFile(`/reports/recitation-sessions/export?${params.toString()}`);
  },
  exportStudentSavedReport: ({ from, to, committeeId = 'all', studentId = 'all', format = 'pdf' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (committeeId) params.set('committeeId', committeeId);
    if (studentId) params.set('studentId', studentId);
    params.set('format', format);
    return requestFile(`/reports/student-saved/export?${params.toString()}`);
  },
  getReportWhatsAppRecipients: () => request('/reports/whatsapp-recipients'),
  getStudentPointsReport: ({ committeeId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (committeeId && committeeId !== 'all') params.set('committeeId', committeeId);
    return request(`/reports/student-points?${params.toString()}`);
  },
  getGradingSessionReport: ({ component, from, to, committeeId = 'all' } = {}) => {
    const query = new URLSearchParams({ component, from, to, committeeId });
    return request(`/reports/grading-sessions?${query}`);
  },
  getTeacherPointsReport: ({ from = '', to = '', committeeId = 'all', complexId = 'all' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('committeeId', committeeId);
    params.set('complexId', complexId);
    return request(`/reports/teacher-points?${params.toString()}`);
  },
  sendReportWhatsApp: (payload) =>
    request('/reports/send-whatsapp', {
      method: 'POST',
      timeoutMs: 0,
      body: JSON.stringify(payload),
    }),
  getPointsReport: ({ date, type = 'students', studentId = 'all', familyId = 'all' }) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (date) params.set('date', date);
    if (studentId && studentId !== 'all') params.set('studentId', studentId);
    if (familyId && familyId !== 'all') params.set('familyId', familyId);
    return request(`/reports/points?${params.toString()}`);
  },
  getStudentPoints: (studentId) => request(`/students/${studentId}/points`),
  bootstrapOfflineStudent: () => request('/offline-student/bootstrap', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};
