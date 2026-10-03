import { Capacitor } from '@capacitor/core';
import { getAuthSessionVersion, getBearerToken } from '@/lib/authSession';
import { getApiBase, getTenantRegistrationNumber } from './apiBase';

/** Fetch streaming also carries the native bearer credential and tenant header. */
export function subscribeCallDirectory({ onData, onError }) {
  const controller = new AbortController();
  const sessionVersion = getAuthSessionVersion(), base = getApiBase(), tenant = getTenantRegistrationNumber();
  let retryTimer;
  const current = () => !controller.signal.aborted && sessionVersion === getAuthSessionVersion()
    && base === getApiBase() && tenant === getTenantRegistrationNumber();
  const connect = async () => {
    try {
      const token = await getBearerToken();
      if (!current()) return;
      const response = await fetch(`${base}/calls/events`, { signal: controller.signal, credentials: 'include', cache: 'no-store',
        headers: { Accept: 'text/event-stream', Authorization: token ? `Bearer ${token}` : '',
          'X-Registration-Number': tenant, 'X-Nukhab-Native': Capacitor.isNativePlatform() ? '1' : '0' } });
      if (!response.ok || !response.body) throw Object.assign(new Error('تعذر الاتصال بتحديثات المكالمات.'), { status: response.status });
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '';
      try {
        while (current()) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true }).replaceAll('\r', '');
          let boundary;
          while ((boundary = pending.indexOf('\n\n')) !== -1) {
            const event = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            const payload = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (!payload || !current()) continue;
            if (event.includes('event: unavailable')) onError(new Error(JSON.parse(payload).message));
            else onData(JSON.parse(payload));
          }
        }
      } finally { await reader.cancel(); }
      if (current()) throw new Error('انقطع تحديث المكالمات؛ جارٍ إعادة الاتصال.');
    } catch (error) {
      if (!current()) return;
      onError(error);
      if ([401, 403].includes(error.status)) return;
      retryTimer = window.setTimeout(connect, 3000);
    }
  };
  void connect();
  return () => { controller.abort(); window.clearTimeout(retryTimer); };
}
