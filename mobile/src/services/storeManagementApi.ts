import { nativeSessionApiBase, type NativeSession, type NativeSessionController } from '../domain/nativeSession';
import { canManageStore, decodeStoreConfiguration, decodeStoreOrder, decodeStoreOrders, decodeStoreProduct, decodeStoreProducts, decodeStorePublicSettings,
  normalizeStoreConfigurationPatch, normalizeStoreProductDraft, storeConfigurationSnapshot, storeConfigurationTarget, storeId,
  storeObject, storeOrderSnapshot, storeProductSnapshot, type StoreConfiguration, type StoreConfigurationPatch,
  type StoreManagementData, type StoreOrder, type StoreOrderDecision, type StoreProduct, type StoreProductDraft } from '../domain/storeManagement';
import { NativeApiError } from './nativeApi';

type PendingStoreOperation = { kind: 'configuration'; target: StoreConfiguration }
  | { kind: 'product'; id: number | null; target: StoreProduct | null }
  | { kind: 'delete'; id: number }
  | { kind: 'decision'; id: number; status: StoreOrderDecision };
const pendingByController = new WeakMap<NativeSessionController, Map<string, PendingStoreOperation>>();
const runningByController = new WeakMap<NativeSessionController, Set<string>>();
export function createStoreManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(), actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const apiBase = nativeSessionApiBase(controller), context = JSON.stringify([apiBase, actor.complex.registrationNumber, actor.role, actor.id]);
  const pending = pendingByController.get(controller) ?? new Map<string, PendingStoreOperation>(); pendingByController.set(controller, pending);
  const running = runningByController.get(controller) ?? new Set<string>(); runningByController.set(controller, running);
  function current(): NativeSession {
    const state = controller.getSnapshot(), identity = state.session;
    if (state.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (context !== JSON.stringify([nativeSessionApiBase(controller), identity.complex.registrationNumber, identity.role, identity.id])) throw new NativeApiError('cancelled');
    if (!canManageStore(identity)) throw new NativeApiError('forbidden'); return identity;
  }
  current();
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T, onDispatch?: () => void): Promise<T> {
    current();
    try { onDispatch?.(); const result = await controller.request(path, options, decode); current(); return result; }
    catch (cause) { current(); throw cause; }
  }
  async function feature(signal?: AbortSignal) {
    const settings = await request('/public-settings', { signal }, decodeStorePublicSettings);
    if (!settings.storeSectionEnabled) throw new NativeApiError('forbidden'); return settings;
  }
  const configuration = (signal?: AbortSignal) => request('/store/configuration', { signal }, decodeStoreConfiguration);
  const products = (signal?: AbortSignal) => request('/store/products', { signal }, value => decodeStoreProducts(value).products);
  const orders = (signal?: AbortSignal) => request('/store/orders', { signal }, decodeStoreOrders);
  function reconcile(config: StoreConfiguration, productRows: readonly StoreProduct[], orderRows: readonly StoreOrder[]): boolean {
    const operation = pending.get(context); if (!operation) return false;
    const matches = operation.kind === 'configuration' ? storeConfigurationSnapshot(config) === storeConfigurationSnapshot(operation.target)
      : operation.kind === 'decision' ? orderRows.some(row => row.id === operation.id && row.status === operation.status)
      : operation.kind === 'delete' ? config.storeEnabled && !productRows.some(row => row.id === operation.id)
      : config.storeEnabled && operation.id !== null && operation.target !== null && productRows.some(row => row.id === operation.id && storeProductSnapshot(row) === storeProductSnapshot(operation.target!));
    if (!matches) return false;
    current(); pending.delete(context); return true;
  }
  async function freshProduct(id: number, expected: StoreProduct): Promise<StoreProduct> {
    await feature(); const config = await configuration(); if (!config.storeEnabled) throw new NativeApiError('conflict', 409);
    const row = (await products()).find(product => product.id === id);
    if (!row || storeProductSnapshot(row) !== storeProductSnapshot(expected)) throw new NativeApiError('conflict', 409); return row;
  }
  function validateProduct(id: number, expected: StoreProduct): StoreProduct {
    storeId(id); const validated = decodeStoreProduct(expected); if (validated.id !== id) throw new NativeApiError('validation'); return validated;
  }
  async function mutation<T>(work: (dispatch: () => void, acknowledge: () => void) => Promise<T>): Promise<T> {
    current(); if (pending.has(context) || running.has(context)) throw new NativeApiError('conflict');
    running.add(context); let dispatched = false, acknowledged = false;
    try { return await work(() => { dispatched = true; }, () => { acknowledged = true; }); }
    catch (cause) {
      const rejected = cause instanceof NativeApiError && !!cause.status && [400, 401, 403, 404, 409, 413, 422].includes(cause.status);
      if (!dispatched || (!acknowledged && rejected)) pending.delete(context); throw cause;
    } finally { running.delete(context); }
  }
  async function verifyProduct(id: number, target: StoreProduct) {
    const config = await configuration(); if (!config.storeEnabled) throw new NativeApiError('conflict');
    const row = (await products()).find(product => product.id === id);
    if (!row || storeProductSnapshot(row) !== storeProductSnapshot(target)) throw new NativeApiError('invalid-response');
    current(); pending.delete(context);
  }
  return {
    scopeKey: () => context,
    assertActive: () => { current(); },
    hasUncertainOperation: () => pending.has(context),
    async load(signal?: AbortSignal): Promise<StoreManagementData> {
      current(); if (running.has(context)) throw new NativeApiError('conflict');
      await feature(signal); const config = await configuration(signal);
      const [productRows, orderRows] = await Promise.all([config.storeEnabled ? products(signal) : Promise.resolve([]), orders(signal)]);
      current(); reconcile(config, productRows, orderRows); const identity = current();
      return Object.freeze({ scopeKey: context, actor: Object.freeze({ role: identity.role, id: identity.id, name: identity.name }), configuration: config,
        products: Object.freeze(productRows), orders: Object.freeze(orderRows), canManage: true, uncertainOperation: pending.has(context) });
    },
    async saveProduct({ draft, expected }: { draft: StoreProductDraft; expected?: StoreProduct }): Promise<{ verified: true; id: number }> {
      current(); const validated = expected ? decodeStoreProduct(expected) : undefined, payload = normalizeStoreProductDraft(draft, validated);
      return mutation(async (dispatch, acknowledge) => {
        if (validated) await freshProduct(validated.id, validated);
        else { await feature(); if (!(await configuration()).storeEnabled) throw new NativeApiError('conflict', 409); }
        // A create has no idempotency key. An unacknowledged image transformation
        // has no known display image either; neither can be matched by guesswork.
        const target = validated && payload.imageData === undefined ? Object.freeze({ ...validated, ...payload }) : null;
        pending.set(context, { kind: 'product', id: validated?.id ?? null, target });
        const saved = await request(validated ? `/store/products/${validated.id}` : '/store/products', { method: validated ? 'PUT' : 'POST', body: payload }, value => {
          const row = decodeStoreProduct(value);
          if ((validated && row.id !== validated.id) || row.name !== payload.name || row.pointsPrice !== payload.pointsPrice || row.stock !== payload.stock || row.isActive !== payload.isActive
            || (validated && payload.imageData === undefined && row.imageData !== validated.imageData) || (payload.imageData === '' && row.imageData !== '')) throw new NativeApiError('invalid-response');
          pending.set(context, { kind: 'product', id: row.id, target: row }); acknowledge(); return row;
        }, dispatch);
        await verifyProduct(saved.id, saved); return { verified: true, id: saved.id };
      });
    },
    async toggleActive({ id, isActive, expected }: { id: number; isActive: boolean; expected: StoreProduct }): Promise<{ verified: true; id: number }> {
      current(); const validated = validateProduct(id, expected); if (typeof isActive !== 'boolean') throw new NativeApiError('validation');
      return mutation(async (dispatch, acknowledge) => {
        await freshProduct(id, validated); const target = Object.freeze({ ...validated, isActive }); pending.set(context, { kind: 'product', id, target });
        await request(`/store/products/${id}/active`, { method: 'PATCH', body: { isActive } }, value => {
          const row = storeObject(value); if (row.ok !== true || row.isActive !== isActive) throw new NativeApiError('invalid-response'); acknowledge(); return true;
        }, dispatch);
        await verifyProduct(id, target); return { verified: true, id };
      });
    },
    async removeProduct({ id, expected }: { id: number; expected: StoreProduct }): Promise<{ verified: true; id: number }> {
      current(); const validated = validateProduct(id, expected);
      return mutation(async (dispatch, acknowledge) => {
        await freshProduct(id, validated); pending.set(context, { kind: 'delete', id });
        await request(`/store/products/${id}`, { method: 'DELETE' }, value => { if (storeObject(value).ok !== true) throw new NativeApiError('invalid-response'); acknowledge(); return true; }, dispatch);
        const config = await configuration(); if (!config.storeEnabled || (await products()).some(product => product.id === id)) throw new NativeApiError('invalid-response');
        current(); pending.delete(context); return { verified: true, id };
      });
    },
    async decideOrder({ id, status, expected }: { id: number; status: StoreOrderDecision; expected: StoreOrder }): Promise<{ verified: true; id: number }> {
      current(); storeId(id); expected = decodeStoreOrder(expected); const validated = storeOrderSnapshot(expected);
      if (expected.id !== id || expected.status !== 'pending' || !['accepted', 'rejected'].includes(status)) throw new NativeApiError('validation');
      return mutation(async (dispatch, acknowledge) => {
        await feature(); const fresh = (await orders()).find(order => order.id === id);
        if (!fresh || storeOrderSnapshot(fresh) !== validated) throw new NativeApiError('conflict', 409);
        pending.set(context, { kind: 'decision', id, status });
        await request(`/store/orders/${id}/decision`, { method: 'PATCH', body: { status } }, value => {
          const row = storeObject(value); if (row.ok !== true || row.status !== status || (row.alreadyProcessed !== undefined && typeof row.alreadyProcessed !== 'boolean')) throw new NativeApiError('invalid-response'); acknowledge(); return true;
        }, dispatch);
        if (!(await orders()).some(order => order.id === id && order.status === status)) throw new NativeApiError('invalid-response');
        current(); pending.delete(context); return { verified: true, id };
      });
    },
    async updateConfiguration({ patch, expected }: { patch: StoreConfigurationPatch; expected: StoreConfiguration }): Promise<{ verified: true }> {
      current(); const normalized = normalizeStoreConfigurationPatch(patch), validated = decodeStoreConfiguration(expected);
      return mutation(async (dispatch, acknowledge) => {
        await feature(); const fresh = await configuration(); if (storeConfigurationSnapshot(fresh) !== storeConfigurationSnapshot(validated)) throw new NativeApiError('conflict', 409);
        const target = storeConfigurationTarget(fresh, normalized); pending.set(context, { kind: 'configuration', target });
        await request('/store/configuration', { method: 'PATCH', body: normalized }, value => {
          const row = decodeStoreConfiguration(value); if (storeConfigurationSnapshot(row) !== storeConfigurationSnapshot(target)) throw new NativeApiError('invalid-response'); acknowledge(); return row;
        }, dispatch);
        if (storeConfigurationSnapshot(await configuration()) !== storeConfigurationSnapshot(target)) throw new NativeApiError('invalid-response');
        current(); pending.delete(context); return { verified: true };
      });
    },
  };
}
export type StoreManagementApi = ReturnType<typeof createStoreManagementApi>;
