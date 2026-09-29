import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { getSiteConfig } from '@/site/siteConfigs';

const tokenKey = 'wajeh_token';
const webSessionKey = 'nukhab_web_session';
const nativeSessionKey = 'nukhab_native_session';
let cachedToken = null;
let secureStorageReady;
let sessionVersion = 0;

export const getAuthSessionVersion = () => sessionVersion;

const prepareSecureStorage = () => {
  if (!secureStorageReady) {
    secureStorageReady = Promise.all([
      SecureStorage.setKeyPrefix(getSiteConfig().secureStoragePrefix),
      SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly),
    ]);
  }
  return secureStorageReady;
};

const isNativeSession = () => Capacitor.isNativePlatform();

export const getBearerToken = async () => {
  if (!isNativeSession()) return '';
  if (cachedToken !== null) return cachedToken;
  const version = sessionVersion;
  const legacyToken = localStorage.getItem(tokenKey) || '';
  await prepareSecureStorage();
  if (legacyToken) {
    await SecureStorage.set(tokenKey, legacyToken);
    localStorage.removeItem(tokenKey);
    if (version === sessionVersion) cachedToken = legacyToken;
    return legacyToken;
  }
  const token = String(await SecureStorage.get(tokenKey) || '');
  if (version === sessionVersion) cachedToken = token;
  return token;
};

export const getAuthSessionMarker = () => (
  isNativeSession()
    ? (localStorage.getItem(nativeSessionKey) || localStorage.getItem(tokenKey) || '')
    : (localStorage.getItem(webSessionKey) || '')
);

export const hasAuthSession = (role = localStorage.getItem('wajeh_role')) => (
  Boolean(role && getAuthSessionMarker())
);

export const persistAuthSession = async (token) => {
  sessionVersion += 1;
  if (isNativeSession()) {
    await prepareSecureStorage();
    if (token) await SecureStorage.set(tokenKey, token);
    else await SecureStorage.remove(tokenKey);
    cachedToken = token || '';
    localStorage.removeItem(tokenKey);
    if (token) localStorage.setItem(nativeSessionKey, '1');
    else localStorage.removeItem(nativeSessionKey);
    localStorage.removeItem(webSessionKey);
    return;
  }
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(nativeSessionKey);
  localStorage.setItem(webSessionKey, '1');
};

export const clearAuthSession = async ({ afterTokenRead } = {}) => {
  sessionVersion += 1;
  const native = isNativeSession();
  cachedToken = native ? '' : cachedToken;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(nativeSessionKey);
  localStorage.removeItem(webSessionKey);
  if (native) {
    // Let logout capture the old credential before removing it from the keychain.
    try {
      if (afterTokenRead) await afterTokenRead;
    } finally {
      cachedToken = '';
      await prepareSecureStorage();
      await SecureStorage.remove(tokenKey);
    }
  }
};
