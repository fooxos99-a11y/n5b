export const NUKHAB_ANDROID_APK_URL = '/downloads/nukhab-android-1.0.24.apk';

export const getDownloadPlatformLinks = (site = {}) => ({
  android: site.androidDownloadUrl || NUKHAB_ANDROID_APK_URL,
  ios: site.appStoreUrl || '',
});

export function detectDownloadPlatform(userAgent = '', maxTouchPoints = 0) {
  const normalized = String(userAgent || '');
  if (/Android/i.test(normalized)) return 'android';
  if (/iPhone|iPad|iPod/i.test(normalized) || (/Macintosh/i.test(normalized) && Number(maxTouchPoints) > 1)) return 'ios';
  return 'other';
}
