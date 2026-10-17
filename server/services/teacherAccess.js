/** Teachers can only read scoped statistics and manage their current login session. */
export function isTeacherApiRequest({ method, path }) {
  const route = String(path || '').replace(/^\/api(?=\/|$)/, '');
  if (method === 'POST') return route === '/auth/logout';
  return method === 'GET' && [
    '/dashboard-permissions/me', '/dashboard-bootstrap', '/reports/overview',
    '/reports/overview/export', '/reports/committees', '/reports/grading-sessions',
  ].includes(route);
}
