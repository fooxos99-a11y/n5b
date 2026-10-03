import { request } from '@/services/studentsApi';

const query = (params = {}) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const text = search.toString();
  return text ? `?${text}` : '';
};

const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });

/** API of the weekly grading model (policy and weekly sessions). */
export const gradingApi = {
  getPolicy: () => request('/grading/policy'),
  savePolicy: async (policy) => {
    const result = await put('/grading/policy', { policy });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nukhab-grading-policy-updated'));
    return result;
  },
  getWeek: ({ weekStart, committeeId, component } = {}) => request(`/grading/week${query({ weekStart, committeeId, component })}`),
  getCompensationDays: ({ studentId, scope }) => request(`/grading/${scope === 'program' ? 'program' : 'track'}-compensation-days${query({ studentId })}`),
  compensateDay: ({ studentId, date, excuseReference, scope = 'track' }) => request(`/grading/${scope === 'program' ? 'program' : 'track'}-compensation`, { method: 'POST', body: JSON.stringify({ studentId, date, excuseReference }) }),
  approveExcuse: body => request('/grading/excuse-approval', { method: 'POST', body: JSON.stringify(body) }),
  cancelCompensation: (id, reason) => request(`/grading/compensations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  prepareTrackTest: ({ studentId, weekStart }) => request('/grading/track-test', { method: 'POST', body: JSON.stringify({ studentId, weekStart }) }),
  setWeeklyComponent: ({ studentId, weekStart, component, attended, attendanceStatus, segments, attemptToken }) => (
    put('/grading/weekly-component', { studentId, weekStart, component, attended, attendanceStatus, segments, attemptToken })
  ),
};
