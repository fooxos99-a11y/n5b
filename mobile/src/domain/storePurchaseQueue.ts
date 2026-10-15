import { decodeStudentStoreSnapshot, decodeStorePurchase, normalizeStudentStorePurchase, storeObject,
  type StudentStoreScope, type StudentStoreSnapshot, type StudentStorePurchase, type StorePurchaseResult } from './storeManagement';
import { NativeApiError } from '../services/nativeApi';

export type StorePurchaseStatus = 'queued' | 'sending' | 'uncertain' | 'synced' | 'rejected';
export interface StoredStorePurchase extends StudentStorePurchase {
  readonly price: number; readonly reservesStock: boolean; readonly createdAt: string;
  readonly status: StorePurchaseStatus; readonly lastError: string; readonly result: StorePurchaseResult | null;
}
export interface StoredStudentStore {
  readonly version: 1; readonly scope: StudentStoreScope; readonly snapshot: StudentStoreSnapshot | null;
  readonly snapshotAt: string | null; readonly visible: boolean | null; readonly actions: readonly StoredStorePurchase[];
  readonly lastError: string;
}
export interface StudentStoreStorage {
  read(scopeKey: string): Promise<unknown | null>;
  update(scopeKey: string, change: (current: unknown | null) => StoredStudentStore): Promise<StoredStudentStore>;
}
export const storePurchasePending = (action: StoredStorePurchase) => ['queued', 'sending', 'uncertain'].includes(action.status);
export function emptyStoredStudentStore(scope: StudentStoreScope): StoredStudentStore {
  return { version: 1, scope, snapshot: null, snapshotAt: null, visible: null, actions: [], lastError: '' };
}
function iso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function decodeStoredStudentStore(value: unknown, scope: StudentStoreScope, scopeKey: string): StoredStudentStore {
  if (value === null) return emptyStoredStudentStore(scope);
  try {
    const row = storeObject(value), storedScope = storeObject(row.scope);
    if (row.version !== 1 || storedScope.apiBase !== scope.apiBase || storedScope.registrationNumber !== scope.registrationNumber
      || storedScope.role !== scope.role || storedScope.id !== scope.id || !Array.isArray(row.actions)
      || (row.visible !== null && typeof row.visible !== 'boolean') || typeof row.lastError !== 'string'
      || row.lastError.length > 500 || (row.snapshotAt !== null && !iso(row.snapshotAt))) throw new NativeApiError('storage');
    const snapshot = row.snapshot === null ? null : decodeStudentStoreSnapshot(row.snapshot, scope, scopeKey);
    if (Boolean(snapshot) !== Boolean(row.snapshotAt)) throw new NativeApiError('storage');
    const actions = row.actions.map((item): StoredStorePurchase => {
      const action = storeObject(item), fixed = normalizeStudentStorePurchase(action as unknown as StudentStorePurchase);
      if (typeof action.price !== 'number' || !Number.isSafeInteger(action.price) || action.price < 1
        || typeof action.reservesStock !== 'boolean' || !iso(action.createdAt) || typeof action.lastError !== 'string'
        || action.lastError.length > 500 || !['queued', 'sending', 'uncertain', 'synced', 'rejected'].includes(String(action.status))) throw new NativeApiError('storage');
      const result = action.result === null ? null : decodeStorePurchase(action.result, fixed);
      if ((action.status === 'synced') !== Boolean(result)) throw new NativeApiError('storage');
      return Object.freeze({ ...fixed, price: action.price, reservesStock: action.reservesStock, createdAt: action.createdAt,
        status: action.status as StorePurchaseStatus, lastError: action.lastError, result });
    });
    if (new Set(actions.map(action => action.requestId)).size !== actions.length
      || (actions.some(storePurchasePending) && (!snapshot?.enabled || snapshot.storeBalance === null))) throw new NativeApiError('storage');
    return { version: 1, scope: Object.freeze({ ...scope }), snapshot, snapshotAt: row.snapshotAt as string | null,
      visible: row.visible as boolean | null, actions: Object.freeze(actions), lastError: row.lastError };
  } catch (cause) {
    throw new NativeApiError(cause instanceof NativeApiError && cause.code === 'cancelled' ? 'cancelled' : 'storage');
  }
}

export function createMemoryStudentStoreStorage(): StudentStoreStorage {
  const records = new Map<string, string>(); let tail: Promise<unknown> = Promise.resolve();
  const serialized = <T,>(work: () => T | Promise<T>): Promise<T> => {
    const result = tail.then(work); tail = result.then(() => undefined, () => undefined); return result;
  };
  const read = (key: string): unknown | null => records.has(key) ? JSON.parse(records.get(key) as string) : null;
  return {
    read: key => serialized(() => read(key)),
    update: (key, change) => serialized(() => { const next = change(read(key)); records.set(key, JSON.stringify(next)); return next; }),
  };
}
