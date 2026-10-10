import { request } from '@/services/studentsApi';
export const passingApi = {
  getPolicy: () => request('/passing/policy'),
  savePolicy: policy => request('/passing/policy', { method: 'PUT', body: JSON.stringify({ policy }) }),
  students: () => request('/passing/students'),
  studentParts: (studentId, type) => request(`/passing/students/${studentId}/parts?type=${type}`),
  list: type => request(`/passing?type=${type}`),
  create: body => request('/passing', { method: 'POST', body: JSON.stringify(body) }),
  saveAttempt: (partId, body) => request(`/passing/parts/${partId}/attempts`, { method: 'POST', body: JSON.stringify(body) }),
  decideRehifz: (partId, body) => request(`/passing/parts/${partId}/rehifz`, { method: 'POST', body: JSON.stringify(body) }),
  mushaf: (partId, index) => request(`/passing/parts/${partId}/segments/${index}/mushaf`),
};
