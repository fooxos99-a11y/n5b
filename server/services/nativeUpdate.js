const APP_ID = 'sa.nukhab.app';
const STORE_CACHE_MS = 300_000;

export function createNativeUpdatePolicy({
  storeId = () => process.env.NUKHAB_IOS_APP_STORE_ID,
  request = (...args) => fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cached;
  return async (app, platform) => {
    const id = String(storeId() || '');
    if (app !== APP_ID || platform !== 'ios' || !/^\d{6,15}$/.test(id)) return { available: false };
    if (!cached || cached.id !== id || cached.expires <= now()) {
      cached = {
        id,
        expires: now() + STORE_CACHE_MS,
        promise: (async () => {
          try {
            const response = await request(`https://itunes.apple.com/lookup?id=${id}&country=sa`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) return { available: false };
            const result = (await response.json()).results?.find(item => item.bundleId === APP_ID && String(item.trackId) === id);
            if (!/^\d+(\.\d+){1,3}$/.test(String(result?.version || ''))) return { available: false };
            return { available: true, minimumVersion: result.version, url: `https://apps.apple.com/sa/app/id${id}` };
          } catch {
            // Only a confirmed, publicly downloadable version may become mandatory.
            return { available: false };
          }
        })(),
      };
    }
    return cached.promise;
  };
}

export const nativeUpdatePolicy = createNativeUpdatePolicy();
