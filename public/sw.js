const BRAND_KEY = new URL(self.location.href).searchParams.get('brand') === 'rabwa' ? 'rabwa' : 'nukhab';
const BRAND = BRAND_KEY === 'rabwa'
  ? { name: 'ربوة', directory: 'rabwa', logo: 'rabwa-logo-color.svg', whiteLogo: 'rabwa-logo-white.svg', iconVersion: 1 }
  : { name: 'نخب', directory: 'nukhab', logo: 'nukhab-color-640.webp', whiteLogo: 'nukhab-white-640.webp', iconVersion: 29 };
const CACHE_VERSION = 44;
const CACHE_PREFIX = `${BRAND_KEY}-pwa-v`;
const CACHE_SUFFIX = `-${self.location.host}`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}${CACHE_SUFFIX}`;
const OFFLINE_DATABASE = 'nukhab_offline_recitation_v1';
const OFFLINE_DATABASE_VERSION = 2;
const scopePath = new URL(self.registration.scope).pathname;
const BASE_PATH = scopePath.endsWith('/') ? scopePath : `${scopePath}/`;
const withBase = (path) => `${BASE_PATH}${path}`.replace(/\/{2,}/g, '/');

const CORE_ASSETS = [
  withBase('index.html'),
  withBase('theme-bootstrap.js'),
  withBase('manifest.webmanifest'),
  withBase(`branding/${BRAND.directory}/${BRAND.logo}`),
  withBase(`branding/${BRAND.directory}/icon-192.png?v=${BRAND.iconVersion}`),
  withBase('fonts/cairo/cairo-arabic.woff2'),
];

const isApiRequest = (url) => url.pathname.startsWith(withBase('api/'));
const isDownloadRequest = (url) => url.pathname.startsWith(withBase('downloads/'));
const isSameOrigin = (url) => url.origin === self.location.origin;
const isCacheFirstAsset = (url) => [
  withBase('assets/'),
  withBase(`branding/${BRAND.directory}/`),
  withBase('fonts/'),
].some((prefix) => url.pathname.startsWith(prefix));
const fallbackResponse = () => new Response('', {
  status: 503, statusText: 'Offline', headers: { 'X-Nukhab-Offline': '1' },
});

async function fetchAndCache(request, cacheKey = request) {
  const response = await fetch(request);
  if (response && response.ok && request.method === 'GET') {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    } catch {
      // Storage quota or disabled caching must not discard a successful network response.
    }
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const retained = new Set(keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key.endsWith(CACHE_SUFFIX))
          .sort((first, second) => {
            const firstVersion = Number(first.slice(CACHE_PREFIX.length).split('-')[0] || 0);
            const secondVersion = Number(second.slice(CACHE_PREFIX.length).split('-')[0] || 0);
            return secondVersion - firstVersion;
          })
          .slice(0, 3));
        retained.add(CACHE_NAME);
        return Promise.all(keys
          .filter((key) => key.startsWith(CACHE_PREFIX)
            && key.endsWith(CACHE_SUFFIX)
            && !retained.has(key))
          .map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (!isSameOrigin(requestUrl) || isApiRequest(requestUrl) || isDownloadRequest(requestUrl)) {
    // Let the browser own API/network failures; never wrap submission requests in respondWith.
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetchAndCache(event.request, withBase('index.html'))
        .catch(() => caches.match(withBase('index.html')).then((response) => response || fallbackResponse()))
    );
    return;
  }

  if (isCacheFirstAsset(requestUrl)) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetchAndCache(event.request))
        .catch(() => fallbackResponse())
    );
    return;
  }

  event.respondWith(
    fetchAndCache(event.request)
      .catch(() => caches.match(event.request).then((response) => response || fallbackResponse()))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || {};
  const title = data.title || BRAND.name;
  const resolveAsset = (path, fallback) => {
    if (!path) return withBase(fallback);
    return new URL(path, self.registration.scope).href;
  };
  const options = {
    body: data.body || '',
    icon: resolveAsset(data.icon, `branding/${BRAND.directory}/icon-192.png`),
    badge: resolveAsset(data.badge, `branding/${BRAND.directory}/icon-192.png`),
    data: {
      url: data.url || BASE_PATH,
    },
    dir: 'rtl',
    lang: 'ar',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || BASE_PATH, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

const openOfflineDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(OFFLINE_DATABASE, OFFLINE_DATABASE_VERSION);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

const readOfflineRows = (database, storeName) => new Promise((resolve, reject) => {
  const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
  request.onsuccess = () => resolve(request.result || []);
  request.onerror = () => reject(request.error);
});

const writeOfflineRow = (database, storeName, row) => new Promise((resolve, reject) => {
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(row);
  transaction.oncomplete = () => resolve(row);
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});

const postOfflineOperation = async (path, payload, method = 'POST', registrationNumber = payload?.registrationNumber || '') => {
  const response = await fetch(withBase(`api/${path}`), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(registrationNumber ? { 'X-Registration-Number': registrationNumber } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || 'تعذرت مزامنة العملية.');
    error.status = response.status;
    throw error;
  }
  return data;
};

const actionRequest = (action) => {
  const payload = action.payload || {};
  if (action.actionType === 'student_attendance') return [`students/${payload.studentId}/attendance`, payload];
  if (action.actionType === 'staff_attendance') return ['staff-attendance/me', payload];
  if (action.actionType === 'quran_test_result') return ['quran-tests/result', payload];
  if (action.actionType === 'narration_part') {
    return [`narration-events/${payload.eventId}/parts/${payload.partId}`, { ...payload, ...payload.evaluation }, 'PUT'];
  }
  if (action.actionType === 'narration_juz') {
    return [`narration-events/${payload.eventId}/students/${payload.entryId}/juz/${payload.juzNumber}`, { ...payload, ...payload.evaluation }, 'PUT'];
  }
  if (action.actionType === 'self_reading') return [`supervisors/${payload.supervisorId}/quran-evaluation/reading`, payload, 'PUT'];
  if (action.actionType === 'narration_student_status') {
    return [`narration-events/${payload.eventId}/students/${payload.entryId}/status`, payload, 'PUT'];
  }
  if (action.actionType === 'store_purchase') return ['store/purchase', payload];
  return null;
};

async function syncStoredActions(database) {
  const actions = (await readOfflineRows(database, 'actions'))
    .filter((row) => ['pending', 'failed', 'syncing'].includes(row.status));
  let retryableFailure = null;
  for (const action of actions) {
    const request = actionRequest(action);
    if (!request) continue;
    try {
      const result = await postOfflineOperation(...request);
      await writeOfflineRow(database, 'actions', {
        ...action, status: 'synced', result, nextRetryAt: null, lastError: '',
      });
    } catch (error) {
      const terminal = Number(error.status) >= 400 && Number(error.status) < 500
        && ![408, 429].includes(Number(error.status));
      const _resolveStatus = () => {
        if (error.status === 403) {
          return 'rejected_permission';
        }
        if (error.status === 409) {
          return 'rejected_conflict';
        }
        if (terminal) {
          return 'rejected_validation';
        }
        return 'failed';
      };
      await writeOfflineRow(database, 'actions', {
        ...action,
        status: _resolveStatus(),
        lastError: error.message,
      });
      if (!terminal) retryableFailure = error;
    }
  }
  if (retryableFailure) throw retryableFailure;
}

async function syncStoredSessions(database) {
  const sessions = (await readOfflineRows(database, 'sessions'))
    .filter((row) => ['pending', 'failed', 'invalid_sequence', 'syncing'].includes(row.status));
  if (!sessions.length) return;
  const response = await postOfflineOperation(
    'offline-recitation/batch',
    { sessions },
    'POST',
    sessions.find((session) => session.registrationNumber)?.registrationNumber || '',
  );
  const outcomes = new Map((response.results || []).map((item) => [item.sessionId, item]));
  for (const session of sessions) {
    const outcome = outcomes.get(session.sessionId);
    if (!outcome) continue;
    const accepted = ['accepted', 'already_synced'].includes(outcome.result);
    const taskResults = new Map((outcome.tasks || []).map((item) => [Number(item.taskId), item]));
    await writeOfflineRow(database, 'sessions', {
      ...session,
      status: accepted ? 'synced' : outcome.result,
      nextRetryAt: accepted || String(outcome.result).startsWith('rejected_') ? null : session.nextRetryAt,
      lastError: accepted ? '' : (outcome.tasks?.find((item) => item.message)?.message || 'تعذرت المزامنة.'),
      tasks: accepted ? session.tasks.map((task) => ({
        ...task,
        synced: true,
        result: taskResults.get(Number(task.taskId))?.data || task.result || null,
      })) : session.tasks,
    });
  }
}

async function syncOfflineDatabase() {
  const database = await openOfflineDatabase();
  try {
    await syncStoredActions(database);
    await syncStoredSessions(database);
  } finally {
    database.close();
  }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(clients.map((client) => client.postMessage({ type: 'NUKHAB_SYNC_OFFLINE_OPERATIONS' })));
}

self.addEventListener('sync', (event) => {
  if (!['nukhab-offline-operations', 'nukhab-offline-recitation'].includes(event.tag)) return;
  event.waitUntil(syncOfflineDatabase());
});
