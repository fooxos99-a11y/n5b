import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSession, type NativeRole, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { decodeStoreConfiguration, decodeStoreOrder, decodeStoreProducts, decodeStorePurchaseResult, decodeStudentStoreSnapshot,
  emptyStoreProductDraft, normalizeStoreConfigurationPatch, normalizeStoreProductDraft, normalizeStudentStorePurchase,
  storeProductDraft, type StoreConfiguration, type StoreOrder, type StoreProduct, type StudentStorePurchase } from '../src/domain/storeManagement';
import { createStoreManagementApi } from '../src/services/storeManagementApi';
import { createStudentStoreApi } from '../src/services/studentStoreApi';
import { NativeApiError, type NativeApi, type NativeApiRequestOptions } from '../src/services/nativeApi';

const baseUrl = 'https://store-fixture.invalid/api', date = '2026-10-14';
const manager: NativeSession = { role: 'manager', id: 7, name: 'StoreFixture', dashboardPermissions: [], complex: { registrationNumber: 'native-store-fixture', name: 'Fixture' } };
const product: StoreProduct = { id: 10, name: 'FixtureProduct', imageData: '', pointsPrice: 8, stock: 3, isActive: true };
const config: StoreConfiguration = { pointsSystemEnabled: true, storeEnabled: true, storePurchaseDeductsRanking: false };
const order: StoreOrder = { id: 31, productName: product.name, pointsPrice: 8, studentName: 'FixturePupil', committeeName: null,
  createdAt: '2026-10-14 15:20', fulfilledAt: null, rejectedAt: null, fulfilled: false, status: 'pending' };
const purchase: StudentStorePurchase = { productId: 10, requestId: 'b109c520-b8ef-4a5a-a74b-e4450aba5d34', purchaseDate: date };
const code = (expected: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === expected;
const png = 'data:image/png;base64,iVBORw0KGgoA';
interface Call { path: string; method: string; body: unknown; signal?: AbortSignal }
interface FixtureState { config: StoreConfiguration; products: StoreProduct[]; orders: StoreOrder[]; balance: number; feature: boolean }
async function fixture(role: NativeRole = 'manager', permissions: string[] = [], hook?: (call: Call, state: FixtureState) => unknown | Promise<unknown>) {
  let actor: NativeSession = { ...manager, role, dashboardPermissions: permissions }, stored: StoredNativeSession | null = null;
  const calls: Call[] = [], state: FixtureState = { config: { ...config }, products: [{ ...product }], orders: [{ ...order }], balance: 24.5, feature: true };
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const api: NativeApi = {
    baseUrl, login: async () => ({ ...actor, token: 'a'.repeat(64) }), session: async () => actor, logout: async () => {},
    async request<T>(path: string, options?: NativeApiRequestOptions, decode?: (value: unknown) => T): Promise<T> {
      const call: Call = { path, method: options?.method ?? 'GET', body: options?.body, signal: options?.signal }; calls.push(call);
      let response = await hook?.(call, state); const body = (options?.body ?? {}) as Record<string, unknown>;
      if (response === undefined) {
        if (path === '/public-settings') response = { storeEnabled: state.config.storeEnabled, storeSectionEnabled: state.feature };
        else if (path === '/store/configuration') {
          if (call.method === 'PATCH') { const enabled = (body.storeEnabled as boolean | undefined) ?? state.config.storeEnabled; state.config = { ...state.config, storeEnabled: enabled, storePurchaseDeductsRanking: enabled && ((body.storePurchaseDeductsRanking as boolean | undefined) ?? state.config.storePurchaseDeductsRanking) }; }
          response = state.config;
        } else if (path === '/store/products' && call.method === 'GET') {
          if (!state.config.storeEnabled) throw new NativeApiError('not-found', 404);
          response = { products: role === 'student' ? state.products.filter(row => row.isActive && row.stock !== 0) : state.products, storeBalance: state.balance };
        } else if (path === '/store/products' && call.method === 'POST') {
          const row = { ...body, id: 11 } as unknown as StoreProduct; state.products.push(row); response = row;
        } else if (/^\/store\/products\/\d+(?:\/active)?$/.test(path)) {
          const id = Number(path.split('/')[3]), row = state.products.find(value => value.id === id);
          if (!row) throw new NativeApiError('not-found', 404);
          if (call.method === 'DELETE') { state.products = state.products.filter(value => value.id !== id); response = { ok: true }; }
          else if (call.method === 'PATCH') { state.products = state.products.map(value => value.id === id ? { ...value, isActive: body.isActive as boolean } : value); response = { ok: true, isActive: body.isActive }; }
          else { const updated = { ...row, ...body } as StoreProduct; state.products = state.products.map(value => value.id === id ? updated : value); response = updated; }
        } else if (path === '/store/orders') response = state.orders;
        else if (path === '/store/orders/31/decision') {
          const status = body.status as 'accepted' | 'rejected'; state.orders = state.orders.map(row => row.id === 31 ? { ...row, status, fulfilled: status === 'accepted', fulfilledAt: status === 'accepted' ? `${date}T15:30:00.000Z` : null, rejectedAt: status === 'rejected' ? `${date}T15:30:00.000Z` : null } : row);
          response = { ok: true, status };
        } else if (path === '/store/purchase') response = { ok: true, orderId: 32, purchaseDate: body.purchaseDate, storeBalance: 16.5 };
        else throw new Error('Unexpected fixture route');
      }
      return decode ? decode(structuredClone(response)) : structuredClone(response) as T;
    },
  };
  const controller = createNativeSession({ api, storage });
  await controller.login({ loginNumber: '940001', password: '', registrationNumber: actor.complex.registrationNumber });
  return { controller, calls, state, change: async (next: NativeSession) => { actor = next; await controller.login({ loginNumber: '940001', password: '', registrationNumber: next.complex.registrationNumber }); },
    grants: async (permissions: string[]) => { actor = { ...actor, dashboardPermissions: permissions }; await controller.restore(); } };
}

test('products distinguish empty stock, zero stock, inactive and duplicate or malformed DTOs', () => {
  assert.equal(decodeStoreProducts({ products: [{ ...product, stock: null }] }).products[0]?.stock, null);
  assert.equal(decodeStoreProducts({ products: [{ ...product, stock: 0, isActive: false }] }).products.length, 1);
  for (const invalid of [{ ...product, stock: -1 }, { ...product, pointsPrice: 0 }, { ...product, id: '10' }, { ...product, isActive: 1 }, { ...product, imageData: 'https://example.invalid/image.png' }]) assert.throws(() => decodeStoreProducts({ products: [invalid] }), code('invalid-response'));
  assert.throws(() => decodeStoreProducts({ products: [product, product] }), code('invalid-response'));
  assert.throws(() => decodeStoreProducts({ products: [{ ...product, stock: 0 }], storeBalance: 24 }, true), code('invalid-response'));
});
test('draft accepts Arabic and Persian digits, unlimited stock and omits the unchanged original image', () => {
  const original = { ...product, imageData: png + 'A'.repeat(2 * 1024 * 1024) };
  assert.deepEqual(normalizeStoreProductDraft({ ...storeProductDraft(original), name: '  منتج  ', pointsPrice: '١٢', stock: '۳' }, original), { name: 'منتج', pointsPrice: 12, stock: 3, isActive: true });
  assert.equal(normalizeStoreProductDraft({ ...emptyStoreProductDraft(), name: 'Fixture' }).stock, null);
  for (const patch of [{ pointsPrice: '0' }, { pointsPrice: '1.5' }, { pointsPrice: '1e3' }, { stock: '-1' }, { stock: '2.3' }, { stock: '9007199254740992' }, { name: 'a'.repeat(181) }]) assert.throws(() => normalizeStoreProductDraft({ ...storeProductDraft(product), ...patch }), code('validation'));
  assert.throws(() => normalizeStoreProductDraft({ ...storeProductDraft(product), imageData: original.imageData }), /صورة أصغر/);
  assert.equal(normalizeStoreProductDraft({ ...storeProductDraft({ ...product, imageData: png }), imageData: '' }, { ...product, imageData: png }).imageData, '');
});
test('configuration is boolean-only and never accepts unrelated settings in a patch', () => {
  assert.deepEqual(decodeStoreConfiguration(config), config);
  for (const patch of [{}, { storeEnabled: 'true' }, { teacherQuran: true }]) assert.throws(() => normalizeStoreConfigurationPatch(patch as never), code('validation'));
  assert.throws(() => decodeStoreConfiguration({ ...config, pointsSystemEnabled: false }), code('invalid-response'));
});
test('order audit timestamps, date and final status must agree with the actual server DTO', () => {
  assert.deepEqual(decodeStoreOrder(order), order);
  for (const invalid of [{ ...order, status: 'accepted' }, { ...order, createdAt: '2026-02-30 12:00' }, { ...order, createdAt: '2026-10-14 25:00' }, { ...order, rejectedAt: '2026-10-14T25:00:00.000Z' }, { ...order, fulfilledAt: `${date}T15:30:00.000Z`, fulfilled: true, status: 'rejected', rejectedAt: `${date}T15:30:00.000Z` }]) assert.throws(() => decodeStoreOrder(invalid), code('invalid-response'));
});
for (const role of ['manager', 'admin', 'supervisor'] as const) test(`${role} with actual store access reads full management catalog and order audit`, async () => {
  const f = await fixture(role, role === 'manager' ? [] : ['store']); f.state.products.push({ ...product, id: 12, isActive: false, stock: 0 });
  const api = createStoreManagementApi(f.controller), data = await api.load(); assert.equal(data.products.length, 2); assert.equal(data.orders.length, 1); assert.equal(data.scopeKey, api.scopeKey()); assert.equal(data.canManage, true);
});
for (const role of ['admin', 'supervisor', 'student'] as const) test(`${role} without management store access causes zero outbound requests`, async () => {
  const f = await fixture(role); assert.throws(() => createStoreManagementApi(f.controller), code('forbidden')); assert.equal(f.calls.length, 0);
});
test('feature off stops management before private configuration, catalog or order reads', async () => {
  const f = await fixture(); f.state.feature = false; await assert.rejects(createStoreManagementApi(f.controller).load(), code('forbidden'));
  assert.deepEqual(f.calls.map(row => row.path), ['/public-settings']);
});
test('disabled management store still reads orders and configuration without treating products 404 as empty proof', async () => {
  const f = await fixture(); f.state.config = { ...config, storeEnabled: false }; const data = await createStoreManagementApi(f.controller).load();
  assert.equal(data.products.length, 0); assert.equal(data.orders.length, 1); assert.equal(f.calls.some(call => call.path === '/store/products'), false);
});
test('management creates and edits verified products, with unchanged display image omitted from PUT', async () => {
  const f = await fixture(), api = createStoreManagementApi(f.controller);
  assert.deepEqual(await api.saveProduct({ draft: { ...emptyStoreProductDraft(), name: 'CreatedFixture', pointsPrice: '١٢', stock: '0' } }), { verified: true, id: 11 });
  assert.deepEqual(await api.saveProduct({ draft: { ...storeProductDraft(product), name: 'EditedFixture' }, expected: product }), { verified: true, id: 10 });
  const update = f.calls.find(call => call.method === 'PUT'); assert.equal(Object.hasOwn(update!.body as object, 'imageData'), false); assert.equal(api.hasUncertainOperation(), false);
});
test('visibility and soft deletion verify their exact product and retain order history', async () => {
  const f = await fixture(), api = createStoreManagementApi(f.controller);
  await api.toggleActive({ id: 10, isActive: false, expected: product }); await api.removeProduct({ id: 10, expected: { ...product, isActive: false } });
  assert.equal(f.state.products.length, 0); assert.equal(f.state.orders.length, 1); assert.equal(api.hasUncertainOperation(), false);
});
for (const status of ['accepted', 'rejected'] as const) test(`pending order ${status} is acknowledged then reread without inventing a fulfillment or delete action`, async () => {
  const f = await fixture(), api = createStoreManagementApi(f.controller); assert.deepEqual(await api.decideOrder({ id: 31, status, expected: order }), { verified: true, id: 31 });
  assert.equal(f.state.orders[0]?.status, status); assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1); assert.equal(f.calls.some(call => call.method === 'DELETE'), false);
});
test('disabling configuration clears ranking deduction and only sends declared two settings', async () => {
  const f = await fixture(); f.state.config = { ...config, storePurchaseDeductsRanking: true };
  await createStoreManagementApi(f.controller).updateConfiguration({ patch: { storeEnabled: false }, expected: f.state.config });
  assert.deepEqual(f.state.config, { ...config, storeEnabled: false, storePurchaseDeductsRanking: false }); assert.deepEqual(f.calls.find(call => call.method === 'PATCH')?.body, { storeEnabled: false });
});
test('fresh changes to product, order or configuration reject before any mutation', async () => {
  const f = await fixture(), api = createStoreManagementApi(f.controller); f.state.products[0] = { ...product, stock: 2 };
  await assert.rejects(api.removeProduct({ id: 10, expected: product }), code('conflict'));
  f.state.orders[0] = { ...order, committeeName: 'Changed' }; await assert.rejects(api.decideOrder({ id: 31, status: 'rejected', expected: order }), code('conflict'));
  f.state.config = { ...config, storePurchaseDeductsRanking: true }; await assert.rejects(api.updateConfiguration({ patch: { storeEnabled: false }, expected: config }), code('conflict'));
  assert.equal(f.calls.some(call => call.method !== 'GET'), false);
});
test('read failure cannot lead to save, toggle, delete or order decision', async () => {
  const f = await fixture('manager', [], call => { if (call.method === 'GET' && ['/store/products', '/store/orders', '/store/configuration'].includes(call.path)) throw new NativeApiError('network'); });
  const api = createStoreManagementApi(f.controller);
  for (const work of [() => api.saveProduct({ draft: storeProductDraft(product), expected: product }), () => api.toggleActive({ id: 10, isActive: false, expected: product }), () => api.removeProduct({ id: 10, expected: product }), () => api.decideOrder({ id: 31, status: 'rejected', expected: order })]) await assert.rejects(work(), code('network'));
  assert.equal(f.calls.some(call => call.method !== 'GET'), false); assert.equal(api.hasUncertainOperation(), false);
});
test('live management grant revocation blocks old factory before any new request', async () => {
  const f = await fixture('admin', ['store']), api = createStoreManagementApi(f.controller); await f.grants([]);
  await assert.rejects(api.load(), code('forbidden')); assert.equal(f.calls.length, 0);
});
test('tenant, role or account change rejects an old factory before any outbound work', async () => {
  for (const next of [{ ...manager, role: 'student' as const }, { ...manager, id: 8 }, { ...manager, complex: { ...manager.complex, registrationNumber: 'other-store-fixture' } }]) {
    const f = await fixture(), api = createStoreManagementApi(f.controller); await f.change(next); await assert.rejects(api.load(), code('cancelled')); assert.equal(f.calls.length, 0);
  }
});
test('identity changes during a read prevent its result and all later reads', async () => {
  let release!: () => void; const waiting = new Promise<void>(done => { release = done; });
  const f = await fixture('manager', [], async call => { if (call.path === '/public-settings') await waiting; }); const api = createStoreManagementApi(f.controller), loading = api.load();
  await f.change({ ...manager, id: 8 }); release(); await assert.rejects(loading, code('cancelled')); assert.equal(f.calls.length, 1);
});
test('unknown create is never reconciled by a matching new row and stays locked across factories', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'POST') { state.products.push({ ...product, id: 11 }); throw new NativeApiError('network'); } });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.saveProduct({ draft: storeProductDraft(product) }), code('network'));
  const recreated = createStoreManagementApi(f.controller); assert.equal((await recreated.load()).uncertainOperation, true);
  await assert.rejects(recreated.saveProduct({ draft: storeProductDraft(product) }), code('conflict')); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('acknowledged create followed by failed verification can reconcile only the returned product id', async () => {
  let created = false, fail = true;
  const f = await fixture('manager', [], (call, state) => {
    if (call.method === 'POST') { created = true; const row = { ...product, id: 11 }; state.products.push(row); return row; }
    if (created && fail && call.path === '/store/products' && call.method === 'GET') throw new NativeApiError('network');
  });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.saveProduct({ draft: storeProductDraft(product) }), code('network')); assert.equal(api.hasUncertainOperation(), true);
  fail = false; assert.equal((await createStoreManagementApi(f.controller).load()).uncertainOperation, false); assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('lost unchanged-image PUT reconciles exact desired state but does not repeat the write', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'PUT') { state.products[0] = { ...product, name: 'ChangedFixture' }; throw new NativeApiError('timeout'); } });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.saveProduct({ draft: { ...storeProductDraft(product), name: 'ChangedFixture' }, expected: product }), code('timeout'));
  assert.equal((await createStoreManagementApi(f.controller).load()).uncertainOperation, false); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
});
test('unknown transformed image cannot be guessed from other changed product fields', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'PUT') { state.products[0] = { ...product, imageData: png }; throw new NativeApiError('network'); } });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.saveProduct({ draft: { ...storeProductDraft(product), imageData: png }, expected: product }), code('network'));
  assert.equal((await api.load()).uncertainOperation, true); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1);
});
test('unknown deletion is not proven by disabled store, failed read or products 404', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'DELETE') { state.products = []; state.config = { ...config, storeEnabled: false }; throw new NativeApiError('network'); } });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.removeProduct({ id: 10, expected: product }), code('network')); assert.equal((await api.load()).uncertainOperation, true);
  f.state.config = config; assert.equal((await api.load()).uncertainOperation, false); assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 1);
});
test('unknown order decision reconciles final audit status with one request and no balance inference', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'PATCH') { state.orders = [{ ...order, status: 'rejected', rejectedAt: `${date}T15:30:00.000Z` }]; throw new NativeApiError('network'); } });
  const api = createStoreManagementApi(f.controller); await assert.rejects(api.decideOrder({ id: 31, status: 'rejected', expected: order }), code('network'));
  assert.equal((await api.load()).uncertainOperation, false); assert.equal(f.calls.some(call => call.path.includes('points') || call.path === '/students'), false);
});
test('known validation refusal clears pending and permits a later explicit save', async () => {
  let fail = true; const f = await fixture('manager', [], call => { if (call.method === 'POST' && fail) throw new NativeApiError('validation', 413); }), api = createStoreManagementApi(f.controller);
  await assert.rejects(api.saveProduct({ draft: storeProductDraft(product) }), code('validation')); assert.equal(api.hasUncertainOperation(), false);
  fail = false; assert.equal((await api.saveProduct({ draft: storeProductDraft(product) })).verified, true);
});
test('unknown configuration and visibility setters reconcile their declared state without replay', async () => {
  for (const kind of ['configuration', 'active'] as const) {
    const f = await fixture('manager', [], (call, state) => {
      if (call.method !== 'PATCH') return;
      if (kind === 'configuration') state.config = { ...config, storePurchaseDeductsRanking: true };
      else state.products[0] = { ...product, isActive: false };
      throw new NativeApiError('network');
    });
    const api = createStoreManagementApi(f.controller);
    await assert.rejects(kind === 'configuration' ? api.updateConfiguration({ patch: { storePurchaseDeductsRanking: true }, expected: config }) : api.toggleActive({ id: 10, isActive: false, expected: product }), code('network'));
    assert.equal((await createStoreManagementApi(f.controller).load()).uncertainOperation, false); assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  }
});
test('a successful mutation reply cannot bypass a grant revoked before post-request validation', async () => {
  let revoke = async () => {};
  const f = await fixture('admin', ['store'], async call => { if (call.method === 'POST') await revoke(); }); revoke = () => f.grants([]);
  const api = createStoreManagementApi(f.controller);
  await assert.rejects(api.saveProduct({ draft: storeProductDraft(product) }), code('forbidden')); assert.equal(api.hasUncertainOperation(), true);
  assert.equal(f.calls.at(-1)?.method, 'POST'); assert.throws(() => createStoreManagementApi(f.controller), code('forbidden'));
  await f.grants(['store']); assert.equal((await createStoreManagementApi(f.controller).load()).uncertainOperation, false);
});
test('a response that replaces an omitted display image is rejected without unlocking the mutation', async () => {
  const f = await fixture('manager', [], call => call.method === 'PUT' ? { ...product, imageData: png } : undefined), api = createStoreManagementApi(f.controller);
  await assert.rejects(api.saveProduct({ draft: storeProductDraft(product), expected: product }), code('invalid-response')); assert.equal(api.hasUncertainOperation(), true);
});
test('parallel writes through recreated factories cannot dispatch a second operation', async () => {
  let release!: () => void; const waiting = new Promise<void>(done => { release = done; });
  const f = await fixture('manager', [], async call => { if (call.path === '/store/configuration' && call.method === 'GET') await waiting; });
  const api = createStoreManagementApi(f.controller), saving = api.saveProduct({ draft: storeProductDraft(product) });
  await assert.rejects(createStoreManagementApi(f.controller).removeProduct({ id: 10, expected: product }), code('conflict')); release(); await saving;
  assert.equal(f.calls.filter(call => call.method !== 'GET').length, 1);
});
test('student catalog is scoped by trusted API base, tenant, role and account, with no private reads', async () => {
  const f = await fixture('student'), api = createStudentStoreApi(f.controller), snapshot = await api.load();
  assert.equal(snapshot.storeBalance, 24.5); assert.deepEqual(api.getScope(), { apiBase: baseUrl, registrationNumber: manager.complex.registrationNumber, role: 'student', id: 7 });
  assert.deepEqual(f.calls.map(row => row.path), ['/public-settings', '/store/products']); assert.deepEqual(decodeStudentStoreSnapshot(snapshot, api.getScope(), api.scopeKey()), snapshot);
  assert.throws(() => decodeStudentStoreSnapshot({ ...snapshot, scope: { ...snapshot.scope, id: 8 } }, api.getScope(), api.scopeKey()), code('invalid-response'));
});
test('disabled student store has unavailable balance and makes no catalog or own-order request', async () => {
  const f = await fixture('student'); f.state.config = { ...config, storeEnabled: false }; const api = createStudentStoreApi(f.controller), snapshot = await api.load();
  assert.equal(snapshot.enabled, false); assert.equal(snapshot.storeBalance, null); assert.equal(snapshot.products.length, 0); assert.equal(f.calls.length, 1);
  assert.throws(() => decodeStudentStoreSnapshot({ ...snapshot, storeBalance: 0 }, api.getScope(), api.scopeKey()), code('invalid-response'));
});
for (const role of ['manager', 'admin', 'supervisor'] as const) test(`${role} cannot use student purchase adapter`, async () => {
  const f = await fixture(role, ['store']); assert.throws(() => createStudentStoreApi(f.controller), code('forbidden')); assert.equal(f.calls.length, 0);
});
test('purchase validates UUID, canonical date and positive product id before any request', async () => {
  const f = await fixture('student'), api = createStudentStoreApi(f.controller);
  for (const input of [{ ...purchase, requestId: 'unkeyed' }, { ...purchase, productId: 0 }, { ...purchase, productId: 1.5 }, { ...purchase, purchaseDate: '2026-02-30' }, { ...purchase, purchaseDate: '٢٠٢٦-١٠-١٤' }]) await assert.rejects(api.purchase(input), code('validation'));
  assert.equal(f.calls.length, 0); assert.deepEqual(normalizeStudentStorePurchase(purchase), purchase);
});
test('purchase sends the immutable UUID/date and validates the echoed date and real order identity', async () => {
  const f = await fixture('student'), api = createStudentStoreApi(f.controller); const result = await api.purchase(purchase);
  assert.deepEqual(result, { ok: true, orderId: 32, purchaseDate: date, storeBalance: 16.5, alreadySynced: false }); assert.deepEqual(f.calls[0]?.body, purchase);
  for (const value of [{ ...result, orderId: 0 }, { ...result, storeBalance: -1 }, { ...result, purchaseDate: '2026-02-30' }]) assert.throws(() => decodeStorePurchaseResult(value), code('invalid-response'));
});
test('deduplicated purchase response acknowledges the same fixed input without claiming order approval', async () => {
  const f = await fixture('student', [], () => ({ ok: true, orderId: 32, purchaseDate: date, storeBalance: 16.5, alreadySynced: true }));
  const result = await createStudentStoreApi(f.controller).purchase(purchase); assert.equal(result.alreadySynced, true); assert.equal('status' in result, false);
});
test('purchase response for another date is rejected despite a valid order id and balance', async () => {
  const f = await fixture('student', [], () => ({ ok: true, orderId: 32, purchaseDate: '2026-10-13', storeBalance: 16.5 }));
  await assert.rejects(createStudentStoreApi(f.controller).purchase(purchase), code('invalid-response')); assert.equal(f.calls.length, 1);
});
test('student API propagates unknown, later feature/date refusals and never guesses via balance reads', async () => {
  let attempts = 0; const f = await fixture('student', [], () => { attempts += 1; throw attempts === 1 ? new NativeApiError('network') : new NativeApiError('conflict', 409); });
  const api = createStudentStoreApi(f.controller); await assert.rejects(api.purchase(purchase), code('network')); await assert.rejects(api.purchase(purchase), code('conflict'));
  assert.deepEqual(f.calls.map(row => row.path), ['/store/purchase', '/store/purchase']); assert.deepEqual(f.calls[0]?.body, f.calls[1]?.body);
});
test('student identity change during purchase cannot return a success for the previous account', async () => {
  let release!: () => void; const waiting = new Promise<void>(done => { release = done; });
  const f = await fixture('student', [], async call => { if (call.path === '/store/purchase') await waiting; });
  const api = createStudentStoreApi(f.controller), buying = api.purchase(purchase); await f.change({ ...manager, role: 'student', id: 8 }); release();
  await assert.rejects(buying, code('cancelled')); assert.throws(() => api.getScope(), code('cancelled')); assert.equal(f.calls.length, 1);
});
test('student catalog cannot recover from a malformed DTO by displaying stale stock or balance', async () => {
  const f = await fixture('student', [], call => call.path === '/store/products' ? { products: [product], storeBalance: '24.5' } : undefined);
  await assert.rejects(createStudentStoreApi(f.controller).load(), code('invalid-response')); assert.equal(f.calls.length, 2);
});
