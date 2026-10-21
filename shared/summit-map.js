export const SUMMIT_TOTAL_KILOMETERS = 8000;
export const SUMMIT_MAX_CONFIGURABLE_KILOMETERS = 100000;
export const SUMMIT_DEFAULT_CITIES = Object.freeze([
  { key: 'buraidah', name: 'بريدة', kilometer: 0 },
  { key: 'unaizah', name: 'عنيزة', kilometer: 1000 },
  { key: 'mithnab', name: 'المذنب', kilometer: 2000 },
  { key: 'rass', name: 'الرس', kilometer: 3000 },
  { key: 'badai', name: 'البدائع', kilometer: 4000 },
  { key: 'bukayriyah', name: 'البكيرية', kilometer: 5000 },
  { key: 'uyun-al-jiwa', name: 'عيون الجواء', kilometer: 6000 },
  { key: 'asyah', name: 'الأسياح', kilometer: 7000 },
]);
const text = (value, fallback, length) => String(value ?? fallback).trim().slice(0, length);
const number = (value, fallback, maximum = SUMMIT_MAX_CONFIGURABLE_KILOMETERS) => Math.min(maximum, Math.max(0, Math.trunc(Number(value ?? fallback) || 0)));
export function normalizeSummitMapConfig(value = {}) {
  const goal = { enabled: value.goal?.enabled !== false, name: text(value.goal?.name, 'الوجهة النهائية', 60),
    kilometer: Math.max(1, number(value.goal?.kilometer, SUMMIT_TOTAL_KILOMETERS)), revealDistance: number(value.goal?.revealDistance, 1000) };
  goal.revealDistance = Math.min(goal.revealDistance, goal.kilometer);
  const maximum = goal.enabled ? goal.kilometer - 1 : SUMMIT_MAX_CONFIGURABLE_KILOMETERS;
  const normalize = (item, index, locationType) => ({
    id: text(item.id || item.key, `${locationType}-${index}`, 80),
    ...(locationType === 'city' ? { key: text(item.id || item.key, `city-${index}`, 80) } : {}),
    locationType, name: text(item.name, '', 60), kilometer: number(item.kilometer, 0, maximum),
    notificationEnabled: locationType === 'city' && item.notificationEnabled === true,
    notificationText: text(item.notificationText, `وصلت إلى ${item.name}`, 180),
    ...(locationType === 'station' ? { rewardPoints: number(item.rewardPoints, 50, 10000) } : {}),
  });
  const cities = (value.cities || SUMMIT_DEFAULT_CITIES).map((item, i) => normalize(item, i, 'city')).sort((a, b) => a.kilometer - b.kilometer);
  const stations = (value.stations || []).map((item, i) => normalize(item, i, 'station')).sort((a, b) => a.kilometer - b.kilometer);
  return { goal, cities, stations, activeStationId: stations.some(item => item.id === value.activeStationId) ? value.activeStationId : null };
}
export function validateSummitMapConfig(value) {
  const fail = () => { throw Object.assign(new Error('تحقق من أسماء المدن والمحطات ومسافاتها وإعدادات الوجهة.'), { status: 422 }); };
  const numeric = (n, min, max) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
  const cleanText = (s, max) => typeof s === 'string' && Boolean(s.trim()) && s.length <= max && !/[\p{Cc}\p{Cf}<>]/u.test(s);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['goal', 'cities', 'stations', 'activeStationId'].includes(key))) fail();
  const goal = value.goal;
  if (!goal || Object.keys(goal).some(key => !['enabled', 'name', 'kilometer', 'revealDistance'].includes(key))
    || typeof goal.enabled !== 'boolean' || !cleanText(goal.name, 60) || !numeric(goal.kilometer, 1, SUMMIT_MAX_CONFIGURABLE_KILOMETERS)
    || !numeric(goal.revealDistance, 0, goal.kilometer)) fail();
  const ids = new Set();
  for (const collection of ['cities', 'stations']) {
    if (!Array.isArray(value[collection]) || value[collection].length > 24) fail();
    const kilometers = new Set();
    for (const item of value[collection]) {
      if (!item || Object.keys(item).some(key => !['id', 'key', 'locationType', 'name', 'kilometer', 'notificationEnabled', 'notificationText', 'rewardPoints'].includes(key))
        || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id)
        || !cleanText(item.name, 60) || !numeric(item.kilometer, 0, goal.enabled ? goal.kilometer - 1 : SUMMIT_MAX_CONFIGURABLE_KILOMETERS)
        || typeof item.notificationEnabled !== 'boolean' || !cleanText(item.notificationText, 180)) fail();
      if (collection === 'stations' && (!numeric(item.rewardPoints, 0, 10000) || kilometers.has(item.kilometer))) fail();
      ids.add(item.id); kilometers.add(item.kilometer);
    }
  }
  if (value.activeStationId !== null && !value.stations.some(item => item.id === value.activeStationId)) fail();
  return normalizeSummitMapConfig(value);
}
export const getSummitActiveStation = config => config.stations.find(item => item.id === config.activeStationId) || null;
export const getSummitMapTotalKilometers = config => config.goal.enabled ? config.goal.kilometer
  : Math.max(1, ...[...config.cities, ...config.stations].map(item => item.kilometer), SUMMIT_TOTAL_KILOMETERS);
export function getSummitMapEventLocations(config) {
  const active = getSummitActiveStation(config);
  return [...config.cities.filter(item => item.kilometer > 0 && item.id !== active?.id), ...(active ? [active] : [])]
    .sort((a, b) => a.kilometer - b.kilometer);
}
