import { createRefreshGate } from '@/lib/refreshGate';
import { singleFlight } from '@/lib/asyncRequests';
import { getAuthSessionVersion } from '@/lib/authSession';
const refreshStudentWorkspace = createRefreshGate(5 * 60_000);
import { studentsApi } from '@/services/studentsApi';
import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import {
  commitOfflineOperation,
  loadOfflineSnapshot,
  offlineActorKey,
  syncOfflineActions,
} from '@/services/offlineOperationsService';
import { getBusinessDate } from '../../shared/business-date.js';
import { loadStudentPlan } from '@/services/studentPlanService';
import { loadStudentLevel, loadStudentMemorized, loadStudentHomeRankings } from '@/services/studentHomeService';

const workspaceKey = (studentId) => `${offlineActorKey(studentId, 'student')}:workspace`;
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const getSaudiDate = getBusinessDate;
const SAVED_PLAN_SNAPSHOT_KEY = 'student:quran-saved-plan-v3';

export const loadOfflineStudentSavedPlan = (studentId) => loadOfflineSnapshot(
  studentId,
  SAVED_PLAN_SNAPSHOT_KEY,
  async () => {
    const [memorizedJuzs, today] = await Promise.all([
      studentsApi.getStudentQuranSaved(studentId),
      studentsApi.getStudentQuranToday(studentId),
    ]);
    return {
      memorizedJuzs: Array.isArray(memorizedJuzs) ? memorizedJuzs : [],
      today,
    };
  },
  { actorRole: 'student' },
);

const projectWorkspaceForToday = (workspace) => {
  if (!workspace) return workspace;
  const date = getSaudiDate();
  const _resolvePurchasedDates = () => {
    if (Array.isArray(workspace.store?.purchasedDates)) {
      return workspace.store.purchasedDates;
    }
    if (workspace.store?.purchasedToday && workspace.date) {
      return [workspace.date];
    }
    return [];
  };
  const purchasedDates = _resolvePurchasedDates();
  return {
    ...workspace,
    date,
    store: {
      ...workspace.store,
      purchasedDates,
      purchasedToday: purchasedDates.includes(date),
      pendingSync: workspace.store?.pendingPurchaseDate === date,
    },
  };
};

const saveWorkspace = async (studentId, workspace) => {
  await offlineRecitationStore.cacheSnapshot(workspaceKey(studentId), workspace);
  await offlineRecitationStore.setMeta(
    `offline_prepared_at:${offlineActorKey(studentId, 'student')}`,
    workspace?.preparedAt || new Date().toISOString(),
  );
  return workspace;
};

export const getCachedOfflineStudentWorkspace = (studentId) => (
  offlineRecitationStore.getSnapshot(workspaceKey(studentId))
);

const fetchStudentStore = singleFlight(async (key, sessionVersion) => {
  const data = await studentsApi.getStoreProducts();
  if (sessionVersion !== getAuthSessionVersion()) throw new Error('تغيّرت جلسة الحساب.');
  const workspace = await offlineRecitationStore.getSnapshot(key);
  // Do not overwrite a purchase waiting to be delivered with an older server balance.
  if (workspace?.store?.pendingSync) return workspace.store;
  const store = { ...workspace?.store, ...data, enabled: true, pendingSync: false };
  // A store visit caches only the store; it does not mark the full offline workspace prepared.
  await offlineRecitationStore.cacheSnapshot(key, { ...workspace, store });
  return store;
}, (key, sessionVersion) => `${key}:${sessionVersion}`);

export async function loadOfflineStudentStore(studentId) {
  if (!studentId) throw new Error('حساب الطالب غير محدد.');
  const key = workspaceKey(studentId);
  const sessionVersion = getAuthSessionVersion();
  if (isOnline()) {
    try { return await fetchStudentStore(key, sessionVersion); }
    catch (error) {
      if (sessionVersion !== getAuthSessionVersion() || [401, 403, 404].includes(error.status)) throw error;
      const cached = await offlineRecitationStore.getSnapshot(key);
      if (cached?.store) return cached.store;
      throw error;
    }
  }
  const cached = await offlineRecitationStore.getSnapshot(key);
  if (cached?.store) return cached.store;
  throw new Error('بيانات المتجر غير محفوظة. اتصل بالإنترنت أولًا.');
}

export async function prepareOfflineStudentWorkspace(studentId) {
  if (!studentId) throw new Error('حساب الطالب غير محدد.');
  if (!isOnline()) throw new Error('اتصل بالإنترنت لتجهيز بيانات الطالب أولًا.');
  const workspace = await studentsApi.bootstrapOfflineStudent();
  await Promise.allSettled([
    loadOfflineSnapshot(studentId, 'student:quran-sessions', () => (
      studentsApi.getStudentQuranSessions(studentId)
    ), { actorRole: 'student' }),
    loadOfflineStudentSavedPlan(studentId),
    loadStudentPlan(studentId),
    loadStudentLevel(studentId),
    loadStudentMemorized(studentId),
    loadStudentHomeRankings(studentId),
  ]);
  return saveWorkspace(studentId, workspace);
}

export async function loadOfflineStudentWorkspace(studentId, { refresh = true } = {}) {
  const cached = await getCachedOfflineStudentWorkspace(studentId);
  if (!isOnline() || !refresh) {
    if (cached) return projectWorkspaceForToday(cached);
    throw new Error('بيانات الطالب غير مجهزة للعمل دون إنترنت.');
  }
  try {
    return await prepareOfflineStudentWorkspace(studentId);
  } catch (error) {
    if (cached) return projectWorkspaceForToday(cached);
    throw error;
  }
}

const syncStudentAction = async (studentId, action) => {
  if (!isOnline()) return null;
  const synced = (await syncOfflineActions(studentId, { force: true, actorRole: 'student' }))
    .find((item) => item.actionId === action.actionId);
  if (synced?.status?.startsWith('rejected_')) {
    await prepareOfflineStudentWorkspace(studentId).catch(() => undefined);
    throw new Error(synced.lastError || 'رفض السيرفر العملية المحفوظة محليًا.');
  }
  if (synced?.status === 'synced') {
    await prepareOfflineStudentWorkspace(studentId).catch(() => undefined);
    return synced.result;
  }
  return null;
};

const purchaseQueues = new Map();

export async function purchaseOfflineStoreProduct(studentId, product) {
  const key = offlineActorKey(studentId, 'student');
  const previous = purchaseQueues.get(key) || Promise.resolve();
  const operation = previous.then(() => purchaseProduct(studentId, product));
  // A rejected purchase must not prevent the next independent purchase.
  const settled = operation.then(() => undefined, () => undefined);
  purchaseQueues.set(key, settled);
  try { return await operation; }
  finally { if (purchaseQueues.get(key) === settled) purchaseQueues.delete(key); }
}

async function purchaseProduct(studentId, product) {
  const workspace = await loadOfflineStudentWorkspace(studentId, { refresh: false });
  const store = workspace.store;
  if (!store?.enabled) throw new Error('المتجر غير مجهز على هذا الجهاز.');
  const currentProduct = store.products?.find((item) => Number(item.id) === Number(product.id));
  if (!currentProduct || (currentProduct.stock !== null && Number(currentProduct.stock) < 1)) {
    throw new Error('المنتج غير متاح في النسخة المحلية.');
  }
  const price = Number(currentProduct.pointsPrice || 0);
  if (Number(store.storeBalance || 0) < price) throw new Error('رصيد المتجر غير كافٍ.');

  const purchaseDate = getSaudiDate();
  const action = await commitOfflineOperation(studentId, 'store_purchase', {
    productId: Number(currentProduct.id),
    purchaseDate,
  }, {
    actorRole: 'student',
  });
  const pendingWorkspace = {
    ...workspace,
    store: {
      ...store,
      purchasedToday: true,
      purchasedDates: [...new Set([...(store.purchasedDates || []), purchaseDate])],
      pendingPurchaseDate: purchaseDate,
      pendingSync: true,
      storeBalance: Number(store.storeBalance || 0) - price,
      products: store.products.map((item) => {
  if (Number(item.id) === Number(currentProduct.id)) {
    return { ...item, stock: item.stock === null ? null : Math.max(0, Number(item.stock || 0) - 1) };
  }
  return item;
}),
    },
  };
  await saveWorkspace(studentId, pendingWorkspace);
  const result = await syncStudentAction(studentId, action);
  return result || {
    ok: true,
    pendingSync: true,
    purchaseDate,
    storeBalance: pendingWorkspace.store.storeBalance,
  };
}

export async function syncOfflineStudent(studentId, { force = false } = {}) {
  const results = await syncOfflineActions(studentId, { force, actorRole: 'student' });
  if (isOnline()) await refreshStudentWorkspace(`${workspaceKey(studentId)}:${getAuthSessionVersion()}:${getBusinessDate()}`,
    () => prepareOfflineStudentWorkspace(studentId),
    { force: force || results.some(result => result.status === 'synced') },
  ).catch(() => undefined);
  return results;
}
