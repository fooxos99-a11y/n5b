import { request } from '@/services/studentsApi';
export const summitApi = {
  journey: () => request('/summit'),
  settings: () => request('/summit/settings'),
  saveSettings: settings => request('/summit/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  progress: kilometers => request('/summit/progress', { method: 'PUT', body: JSON.stringify({ kilometers }) }),
  acknowledge: id => request(`/summit/arrivals/${encodeURIComponent(id)}`, { method: 'POST', body: '{}' }),
  getStationGrades: id => request(`/summit/stations/${encodeURIComponent(id)}/grades`),
  saveStationGrades: (id, grades) => request(`/summit/stations/${encodeURIComponent(id)}/grades`, { method: 'PUT', body: JSON.stringify({ grades }) }),
};
