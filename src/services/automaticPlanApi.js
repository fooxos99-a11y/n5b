import { request } from './studentsApi';

export const automaticPlanApi = {
  loadTemplate: () => request('/student-plans/automatic'),
  saveTemplate: template => request('/student-plans/automatic', { method: 'PUT', body: JSON.stringify(template) }),
  preview: (studentId, payload) => request(`/student-plans/automatic/${studentId}/preview`, { method: 'POST', body: JSON.stringify(payload) }),
  savePrior: (studentId, ranges) => request(`/student-plans/automatic/${studentId}/prior-memorization`, { method: 'POST', body: JSON.stringify({ ranges }) }),
};
