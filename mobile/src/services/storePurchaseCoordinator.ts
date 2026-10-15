import { getBusinessDate } from '../../../shared/business-date.js';
import { decodeStoredStudentStore, storePurchasePending, type StoredStudentStore, type StoredStorePurchase, type StudentStoreStorage } from '../domain/storePurchaseQueue';
import { decodeStorePurchase, normalizeStudentStorePurchase, storeProductSnapshot,
  type StudentStoreSnapshot, type StoreProduct } from '../domain/storeManagement';
import { NativeApiError } from './nativeApi';
import type { StudentStoreApi } from './studentStoreApi';

export interface StudentStoreView extends StudentStoreSnapshot {
  readonly pendingSync: boolean; readonly pendingCount: number; readonly notice: string; readonly source: 'server' | 'cache';
}
export interface StorePurchaseOutcome { readonly snapshot: StudentStoreView; readonly state: 'queued' | 'synced' }
export interface StudentStoreCoordinator {
  scopeKey(): string;
  load(signal?: AbortSignal): Promise<StudentStoreView>;
  reconcile(signal?: AbortSignal): Promise<StudentStoreView>;
  purchase(product: StoreProduct): Promise<StorePurchaseOutcome>;
}
const coordinators = new WeakMap<object, Map<string, StudentStoreCoordinator>>();
const PENDING_NOTICE = 'حُفظ الشراء وينتظر المزامنة.';

export function createStudentStoreCoordinator(api: StudentStoreApi, storage: StudentStoreStorage, options: {
  uuid: () => string; owner?: object; now?: () => Date;
}): StudentStoreCoordinator {
  const scope = api.getScope(), scopeKey = api.scopeKey(), owner = options.owner ?? api;
  const existing = coordinators.get(owner)?.get(scopeKey); if (existing) return existing;
  const now = options.now ?? (() => new Date());
  let tail: Promise<unknown> = Promise.resolve(); let purchasing: Promise<StorePurchaseOutcome> | null = null;
  const check = (signal?: AbortSignal) => { api.assertActive(); if (signal?.aborted) throw new NativeApiError('cancelled'); };
  const state = async () => { check(); const row = await storage.read(scopeKey); check(); return decodeStoredStudentStore(row, scope, scopeKey); };
  const update = async (change: (current: StoredStudentStore) => StoredStudentStore) => {
    check(); const next = await storage.update(scopeKey, value => { check(); return change(decodeStoredStudentStore(value, scope, scopeKey)); }); check(); return next;
  };
  const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work); tail = result.then(() => undefined, () => undefined); return result;
  };
  function view(current: StoredStudentStore, source: 'server' | 'cache'): StudentStoreView {
    const pending = current.actions.filter(storePurchasePending), saved = current.snapshot;
    if (!saved) throw new NativeApiError('network');
    const enabled = current.visible !== false && saved.enabled;
    const products = enabled ? saved.products.map(product => {
      const reserved = pending.filter(action => action.productId === product.id && action.reservesStock).length;
      return { ...product, stock: product.stock === null ? null : Math.max(0, product.stock - reserved) };
    }).filter(product => product.stock !== 0) : [];
    const balance = enabled && saved.storeBalance !== null ? Math.max(0, saved.storeBalance - pending.reduce((sum, action) => sum + action.price, 0)) : null;
    return Object.freeze({ scope, scopeKey, enabled, products: Object.freeze(products), storeBalance: balance,
      pendingSync: pending.length > 0, pendingCount: pending.length, notice: pending.length ? PENDING_NOTICE : current.lastError,
      source: pending.length ? 'cache' : source });
  }
  async function drain(signal?: AbortSignal) {
    const pending = (await state()).actions.filter(storePurchasePending);
    for (const action of pending) {
      check(signal); const uncertainBefore = action.status !== 'queued';
      await update(current => ({ ...current, actions: current.actions.map(row => row.requestId === action.requestId && storePurchasePending(row) ? { ...row, status: 'sending' } : row) }));
      try {
        const result = decodeStorePurchase(await api.purchase(action, signal), action); check();
        await update(current => {
          const recorded = current.actions.find(row => row.requestId === action.requestId);
          if (!recorded || recorded.status === 'synced') return current;
          const snapshot = current.snapshot ? { ...current.snapshot, storeBalance: result.storeBalance,
            products: current.snapshot.products.map(product => product.id === action.productId && action.reservesStock && product.stock !== null
              ? { ...product, stock: Math.max(0, product.stock - 1) } : product).filter(product => product.stock !== 0) } : null;
          return { ...current, snapshot, lastError: '', actions: current.actions.map(row => row.requestId === action.requestId ? { ...row, status: 'synced', result, lastError: '' } : row) };
        });
      } catch (cause) {
        api.assertActive();
        const failure = cause instanceof NativeApiError ? cause : new NativeApiError('network');
        const knownRejected = !uncertainBefore && failure.status !== undefined && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status);
        await update(current => ({ ...current, visible: failure.code === 'forbidden' ? false : current.visible,
          lastError: failure.message, actions: current.actions.map(row => row.requestId === action.requestId && row.status !== 'synced'
          ? { ...row, status: knownRejected ? 'rejected' : 'uncertain', lastError: failure.message } : row) }));
        if (['unauthorized', 'forbidden', 'cancelled', 'storage'].includes(failure.code)) throw failure;
        if (!knownRejected) return;
      }
    }
  }
  async function load(signal?: AbortSignal): Promise<StudentStoreView> {
    check(signal); await drain(signal); check(signal);
    try {
      const snapshot = await api.load(signal); check(signal);
      const current = await update(saved => ({ ...saved, visible: snapshot.enabled,
        // A server balance can already contain an unconfirmed purchase. Keep
        // its pre-purchase base until the durable UUID receives a verified reply.
        snapshot: saved.actions.some(storePurchasePending) && saved.snapshot ? saved.snapshot : snapshot,
        snapshotAt: saved.actions.some(storePurchasePending) && saved.snapshot ? saved.snapshotAt : now().toISOString() }));
      return view(current, 'server');
    } catch (cause) {
      check(signal);
      if (cause instanceof NativeApiError && ['forbidden', 'not-found', 'invalid-response'].includes(cause.code)) {
        await update(saved => ({ ...saved, visible: false, lastError: cause.message }));
      }
      if (!(cause instanceof NativeApiError) || !['network', 'timeout', 'server'].includes(cause.code)) throw cause;
      return view(await state(), 'cache');
    }
  }
  const coordinator: StudentStoreCoordinator = {
    scopeKey: () => scopeKey,
    load: signal => serialize(() => load(signal)),
    reconcile: signal => serialize(() => load(signal)),
    purchase: product => {
      if (purchasing) return purchasing;
      const operation = serialize(async () => {
        check();
        if ((await state()).actions.some(storePurchasePending)) throw new Error('انتظر مزامنة الطلب المحفوظ قبل شراء منتج آخر.');
        await load();
        const instant = now(), fixed = normalizeStudentStorePurchase({ productId: product.id, requestId: options.uuid(), purchaseDate: getBusinessDate(instant) });
        await update(saved => {
          if (saved.actions.some(row => row.requestId === fixed.requestId)) throw new NativeApiError('conflict');
          if (saved.actions.some(storePurchasePending)) throw new Error('انتظر مزامنة الطلب المحفوظ قبل شراء منتج آخر.');
          const visible = view(saved, 'cache'), current = visible.products.find(row => row.id === product.id);
          if (!visible.enabled || !current || current.stock === 0
            || storeProductSnapshot(current) !== storeProductSnapshot(product)) throw new NativeApiError('conflict');
          if (visible.storeBalance === null || visible.storeBalance < current.pointsPrice) throw new Error('رصيد المتجر غير كافٍ.');
          const action: StoredStorePurchase = { ...fixed, price: current.pointsPrice, reservesStock: current.stock !== null,
            createdAt: instant.toISOString(), status: 'queued', lastError: '', result: null };
          return { ...saved, actions: [...saved.actions, action], lastError: '' };
        });
        await drain(); const after = await state(), recorded = after.actions.find(row => row.requestId === fixed.requestId);
        if (recorded?.status === 'rejected') throw new Error(recorded.lastError || 'تعذّر حفظ طلب الشراء.');
        return { snapshot: view(after, 'server'), state: recorded?.status === 'synced' ? 'synced' as const : 'queued' as const };
      });
      purchasing = operation.finally(() => { purchasing = null; }); return purchasing;
    },
  };
  const owned = coordinators.get(owner) ?? new Map<string, StudentStoreCoordinator>(); owned.set(scopeKey, coordinator); coordinators.set(owner, owned);
  return coordinator;
}
