/** Reciters have no teacher/self-service exceptions. Other routes need an explicit grant. */
export function isReciterBaseApiRequest({ method, path }) {
  const route = String(path || '').replace(/^\/api(?=\/|$)/, '');
  if (/^\/calls(?:\/|$)/.test(route)) return true;
  if (method === 'GET' && ['/dashboard-permissions/me', '/dashboard-bootstrap', '/account-deletion/me'].includes(route)) return true;
  if (route === '/account-deletion' && ['POST', 'DELETE'].includes(method)) return true;
  return method === 'POST' && route === '/auth/logout';
}
