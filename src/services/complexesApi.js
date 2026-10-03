import { request } from './studentsApi';

export const complexesApi = {
  list: () => request('/complexes'),
  create: payload => request('/complexes', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/complexes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
};
