import { nativeSessionApiBase, type NativeSession, type NativeSessionController } from '../domain/nativeSession';
import { decodeStoreProducts, decodeStudentStoreSettings, decodeStorePurchase, normalizeStudentStorePurchase,
  type StudentStorePurchase, type StudentStoreScope, type StudentStoreSnapshot, type StorePurchaseResult } from '../domain/storeManagement';
import { NativeApiError } from './nativeApi';

// The purchase coordinator owns durable UUIDs, encrypted storage and retries.
// This adapter never infers a prior purchase from the balance or a later error.
export function createStudentStoreApi(controller: NativeSessionController) {
  const state = controller.getSnapshot(), identity = state.session;
  if (state.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
  if (identity.role !== 'student') throw new NativeApiError('forbidden');
  const scope: StudentStoreScope = Object.freeze({ apiBase: nativeSessionApiBase(controller), registrationNumber: identity.complex.registrationNumber, role: 'student', id: identity.id });
  const key = JSON.stringify([scope.apiBase, scope.registrationNumber, scope.role, scope.id]);
  function current(): NativeSession {
    const active = controller.getSnapshot(); if (active.status !== 'authenticated' || !active.session) throw new NativeApiError('unauthorized');
    const actor = active.session;
    if (key !== JSON.stringify([nativeSessionApiBase(controller), actor.complex.registrationNumber, actor.role, actor.id])) throw new NativeApiError('cancelled'); return actor;
  }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T): Promise<T> {
    current(); try { const result = await controller.request(path, options, decode); current(); return result; }
    catch (cause) { current(); throw cause; }
  }
  return {
    getScope: () => { current(); return scope; },
    scopeKey: () => key,
    assertActive: () => { current(); },
    async load(signal?: AbortSignal): Promise<StudentStoreSnapshot> {
      const settings = await request('/public-settings', { signal }, decodeStudentStoreSettings);
      if (!settings.storeEnabled) return Object.freeze({ scope, scopeKey: key, enabled: false, products: Object.freeze([]), storeBalance: null });
      const catalog = await request('/store/products', { signal }, value => decodeStoreProducts(value, true)); current();
      return Object.freeze({ scope, scopeKey: key, enabled: true, products: catalog.products, storeBalance: catalog.storeBalance });
    },
    async purchase(input: StudentStorePurchase, signal?: AbortSignal): Promise<StorePurchaseResult> {
      current(); const fixed = normalizeStudentStorePurchase(input);
      return request('/store/purchase', { method: 'POST', body: fixed, signal }, value => decodeStorePurchase(value, fixed));
    },
  };
}
export type StudentStoreApi = ReturnType<typeof createStudentStoreApi>;
