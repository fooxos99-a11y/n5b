import { Capacitor } from '@capacitor/core';
import { apiBase } from '@/services/apiBase';
import { prepareTimedRequest } from '@/lib/requestTimeout';

const tokenKey = 'nukhab_owner_token';
const webSessionKey = 'nukhab_owner_web_session';
let pendingLogout = null;
let sessionVersion = 0;

const isNative = () => Capacitor.isNativePlatform();

const clearStoredSession = () => {
  sessionVersion += 1;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(webSessionKey);
};

async function platformRequest(path, options = {}) {
  const requestVersion = sessionVersion;
  const token = isNative() ? localStorage.getItem(tokenKey) : '';
  const timedRequest = prepareTimedRequest({ timeoutMs: path === '/logout' ? undefined : 0, ...options });
  const response = await fetch(`${apiBase}/platform${path}`, {
    ...timedRequest.options,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      'X-Nukhab-Native': isNative() ? '1' : '0',
      ...(options.headers),
    },
  }).finally(timedRequest.cleanup);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && requestVersion === sessionVersion) clearStoredSession();
    const error = new Error(data?.message || 'تعذر تنفيذ الطلب.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const platformApi = {
  hasSession: () => Boolean(
    isNative() ? localStorage.getItem(tokenKey) : localStorage.getItem(webSessionKey),
  ),
  clearSession: clearStoredSession,
  getStatus: () => platformRequest('/status'),
  setup: (payload) => platformRequest('/setup', { method: 'POST', body: JSON.stringify(payload) }),
  login: async (payload) => {
    if (pendingLogout) await pendingLogout;
    const result = await platformRequest('/login', { method: 'POST', body: JSON.stringify(payload) });
    sessionVersion += 1;
    if (isNative()) {
      if (result.token) localStorage.setItem(tokenKey, result.token);
      localStorage.removeItem(webSessionKey);
    } else {
      localStorage.removeItem(tokenKey);
      localStorage.setItem(webSessionKey, '1');
    }
    return result;
  },
  logout: () => {
    if (pendingLogout) return pendingLogout;
    pendingLogout = platformRequest('/logout', { method: 'POST', body: '{}', keepalive: true })
      .finally(() => { pendingLogout = null; });
    clearStoredSession();
    return pendingLogout;
  },
  getComplexes: () => platformRequest('/complexes'),
  getOverview: (days = 30) => platformRequest(`/overview?days=${encodeURIComponent(days)}`),
  getAnalytics: ({ from, to, compare, complexIds = [], committeeId, teacherId }) => {
    const params = new URLSearchParams({ from, to });
    if (compare) params.set('compare', compare);
    if (complexIds.length) params.set('complexIds', complexIds.join(','));
    if (committeeId) params.set('committeeId', committeeId);
    if (teacherId) params.set('teacherId', teacherId);
    return platformRequest(`/analytics?${params.toString()}`);
  },
  getSettings: (complexId) => platformRequest(`/settings/${encodeURIComponent(complexId)}`),
  updateSettings: ({ complexIds = [], settings, policies }) => platformRequest('/settings', {
    method: 'PUT',
    body: JSON.stringify({ complexIds, settings, policies }),
  }),
  getComplexOverview: (id, days = 30) => platformRequest(`/complexes/${encodeURIComponent(id)}/overview?days=${encodeURIComponent(days)}`),
  createComplex: (payload) => platformRequest('/complexes', { method: 'POST', body: JSON.stringify(payload) }),
  updateComplex: (id, payload) => platformRequest(`/complexes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateComplexStatus: (id, status) => platformRequest(`/complexes/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),
};
