import { request } from '@/services/studentsApi';
import { getApiBase, getTenantRegistrationNumber } from '@/services/apiBase';

const base = '/calls/archive';
const id = value => encodeURIComponent(String(value));
export const callArchiveApi = {
  rooms: before => request(`${base}${before ? `?before=${id(before)}` : ''}`),
  room: (roomId, before) => request(`${base}/rooms/${id(roomId)}${before ? `?before=${id(before)}` : ''}`),
  session: sessionId => request(`${base}/sessions/${id(sessionId)}`),
  retry: sessionId => request(`${base}/sessions/${id(sessionId)}/retry`, { method: 'POST', body: '{}' }),
  review: (sessionId, review) => request(`${base}/sessions/${id(sessionId)}/review`, { method: 'PUT', body: JSON.stringify(review) }),
  playback: async (sessionId, mediaId) => {
    const data = await request(`${base}/sessions/${id(sessionId)}/media/${id(mediaId)}/playback`, { method: 'POST', body: '{}' });
    const path = String(data.url || '').replace(/^\/api(?=\/calls\/archive\/)/, '');
    if (!path.startsWith(`${base}/playback/`)) throw new Error('تعذر تجهيز رابط التسجيل.');
    const url = new URL(`${getApiBase()}${path}`, window.location.href);
    const registrationNumber = getTenantRegistrationNumber();
    if (registrationNumber) url.searchParams.set('registrationNumber', registrationNumber);
    return { ...data, url: url.href };
  },
};
