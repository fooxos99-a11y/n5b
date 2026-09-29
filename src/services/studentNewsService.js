import { request } from './studentsApi';
export const studentNewsService = {
  load: () => request('/student-news'),
  manage: () => request('/student-news/manage'),
  audience: () => request('/student-news/audience'),
  save: content => request('/student-news/manage', { method: 'PUT', body: JSON.stringify(content) }),
};
