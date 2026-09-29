export const requestRateScope = (path) => /^\/supervisors\/[^/]+\/quran-evaluation\/[^/]+\/ayahs\/?$/.test(path.split('?')[0])
  ? 'recitation-ayahs' : 'api';

export function createRequestCooldown({ storage, now = Date.now } = {}) {
  const deadlines = new Map();
  const keyFor = (base, scope) => `nukhab:request-cooldown:${base}:${scope}`;
  const read = (key) => {
    try { return Number(storage?.getItem(key) || 0); }
    catch { return deadlines.get(key) || 0; }
  };
  return {
    check(base, path) {
      const key = keyFor(base, requestRateScope(path));
      const general = keyFor(base, 'api');
      const remaining = Math.max(read(key), deadlines.get(key) || 0, read(general), deadlines.get(general) || 0) - now();
      if (remaining <= 0) return;
      const error = new Error(`طلبات كثيرة. أعد المحاولة بعد ${Math.ceil(remaining / 1000)} ثانية.`);
      error.status = 429;
      error.retryAfterMs = remaining;
      throw error;
    },
    record(base, response) {
      if (response.status !== 429) return;
      const header = response.headers.get('Retry-After') || '';
      const milliseconds = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now();
      const scope = response.headers.get('X-RateLimit-Scope') === 'recitation-ayahs' ? 'recitation-ayahs' : 'api';
      const key = keyFor(base, scope);
      const deadline = Math.max(now() + (Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 60_000), read(key));
      deadlines.set(key, deadline);
      try { storage?.setItem(key, String(deadline)); }
      catch { /* The in-memory deadline still protects this tab when storage is unavailable. */ }
    },
  };
}
