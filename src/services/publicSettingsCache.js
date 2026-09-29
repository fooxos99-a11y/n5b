import { studentsApi } from '@/services/studentsApi';
import { getTenantRegistrationNumber } from '@/services/apiBase';

const CACHE_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
let activeRequest = null;

const cacheKey = () => `nukhab_public_settings_v${CACHE_VERSION}_${getTenantRegistrationNumber() || 'default'}`;

export const readPublicSettingsCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (!cached?.value || Date.now() - Number(cached.savedAt || 0) > MAX_AGE_MS) return null;
    return cached.value;
  } catch {
    return null;
  }
};

export const writePublicSettingsCache = (value) => {
  if (!value || typeof value !== 'object') return;
  localStorage.setItem(cacheKey(), JSON.stringify({ savedAt: Date.now(), value }));
};

export const loadPublicSettingsCached = async ({ refresh = false } = {}) => {
  const cached = readPublicSettingsCache();
  if (cached && !refresh) return cached;
  if (activeRequest) return activeRequest;
  activeRequest = studentsApi.getPublicSettings()
    .then((settings) => {
      writePublicSettingsCache(settings);
      return settings;
    })
    .finally(() => { activeRequest = null; });
  return activeRequest;
};
