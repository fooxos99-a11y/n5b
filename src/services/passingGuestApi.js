import { apiBase } from '@/services/apiBase';
import { prepareTimedRequest, requestTimeoutMessage } from '@/lib/requestTimeout';

async function guestRequest(path, { token, linkToken, body, registrationNumber = '', onExpired } = {}) {
  const timed = prepareTimedRequest({ method: body === undefined ? 'GET' : 'POST' });
  try {
    const response = await fetch(`${apiBase}/passing/guest${path}`, {
      ...timed.options, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json',
        ...(token ? { 'X-Passing-Session': token } : {}), ...(linkToken ? { 'X-Passing-Link': linkToken } : {}),
        ...(registrationNumber ? { 'X-Registration-Number': registrationNumber } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) onExpired?.();
      throw new Error(result?.message || 'تعذر تنفيذ الطلب. حاول مرة أخرى.');
    }
    return result;
  } catch (error) {
    if (timed.didTimeOut()) throw new Error(requestTimeoutMessage, { cause: error });
    if (error instanceof TypeError) throw new Error('تعذر الاتصال. تحقق من اتصالك وحاول مرة أخرى.', { cause: error });
    throw error;
  } finally { timed.cleanup(); }
}
export const enterPassing = ({ linkToken, name, registrationNumber }) => guestRequest('/session', { linkToken, registrationNumber, body: { name } });
export function createPassingGuestApi(token, registrationNumber, onExpired) {
  const request = (path, body) => guestRequest(path, { token, registrationNumber, onExpired, body });
  return {
    students: () => request('/students'),
    studentParts: (id, type) => request(`/students/${id}/parts?type=${type}`),
    studentReport: (id, type = 'all') => request(`/students/${id}/report?type=${type}`),
    create: body => request('/', body),
    saveAttempt: (id, body) => request(`/parts/${id}/attempts`, body),
    decideRehifz: (id, body) => request(`/parts/${id}/rehifz`, body),
    mushaf: (id, index) => request(`/parts/${id}/segments/${index}/mushaf`),
  };
}
