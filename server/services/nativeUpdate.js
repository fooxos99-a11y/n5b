import { versionIsOlder } from '../../shared/native-update.js';

const releases = {
  // Add sa.nukhab.app here after its first store release: { android, ios, storeId, androidUrl }.
};
const storeChecks = new Map();
export async function nativeUpdatePolicy(app, platform) {
  const release = releases[app];
  if (!release || !['android', 'ios'].includes(platform)) return { available: false };
  const policy = { minimumVersion: release[platform], url: platform === 'android' ? release.androidUrl : `https://apps.apple.com/sa/app/id${release.storeId}`, available: true };
  if (platform === 'ios') {
    let check = storeChecks.get(app);
    if (!check || check.expires < Date.now()) {
      check = { expires: Date.now() + 300000, promise: (async () => {
        try {
          const response = await fetch(`https://itunes.apple.com/lookup?id=${release.storeId}&country=sa`, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) return false;
          const result = (await response.json()).results?.find(item => item.bundleId === app);
          return Boolean(result?.version && !versionIsOlder(result.version, release.ios));
        } catch { return false; }
      })() };
      storeChecks.set(app, check);
    }
    policy.available = await check.promise;
  }
  return policy;
}
