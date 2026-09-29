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
  savePolicy: (policy) => put('/grading/policy', { policy }),
  getWeek: ({ weekStart, committeeId } = {}) => request(`/grading/week${query({ weekStart, committeeId })}`),
  setWeeklyComponent: ({ studentId, weekStart, component, attended, segments }) => (
    put('/grading/weekly-component', { studentId, weekStart, component, attended, segments })
  ),
};
