import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStudentStoreStorage, decodeStoredStudentStore, emptyStoredStudentStore,
  type StoredStudentStore, type StudentStoreStorage } from '../src/domain/storePurchaseQueue';
import { createNativeSession, nativeSessionApiBase, type NativeSessionController, type SessionStorage } from '../src/domain/nativeSession';
import type { StudentStorePurchase, StudentStoreScope, StudentStoreSnapshot, StoreProduct, StorePurchaseResult } from '../src/domain/storeManagement';
import { createStudentStoreCoordinator } from '../src/services/storePurchaseCoordinator';
import type { StudentStoreApi } from '../src/services/studentStoreApi';
import { NativeApiError, type NativeApi } from '../src/services/nativeApi';

const instant = new Date('2026-10-14T10:00:00.000Z');
const scope: StudentStoreScope = { apiBase: 'https://store-queue-fixture.invalid/api', registrationNumber: 'native-store-queue', role: 'student', id: 7 };
const product: StoreProduct = { id: 11, name: 'QueueFixtureProduct', imageData: '', pointsPrice: 8, stock: 3, isActive: true };
const key = (value: StudentStoreScope) => JSON.stringify([value.apiBase, value.registrationNumber, value.role, value.id]);
const code = (expected: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === expected;
const pendingMessage = /انتظر مزامنة/;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function uuids() { let count = 0; return { next: () => `c0000000-1111-4111-8111-${String(++count).padStart(12, '0')}`, count: () => count }; }
interface Remote {
  enabled: boolean; products: StoreProduct[]; balance: number; commits: number;
  orders: Map<string, StorePurchaseResult>;
}
interface Call { kind: 'load' | 'purchase'; input?: StudentStorePurchase }
function remote(): Remote { return { enabled: true, products: [{ ...product }], balance: 24.5, commits: 0, orders: new Map() }; }
function fixture(options: { scope?: StudentStoreScope; remote?: Remote; load?: (signal?: AbortSignal) => Promise<void>; purchase?: (input: StudentStorePurchase, signal?: AbortSignal) => Promise<StorePurchaseResult> } = {}) {
  const target = options.scope ?? scope, server = options.remote ?? remote();
  let active = true, identity: { apiBase: string; registrationNumber: string; role: string; id: number } = { ...target };
  const calls: Call[] = [];
  const check = () => {
    if (!active) throw new NativeApiError('unauthorized');
    if (JSON.stringify([identity.apiBase, identity.registrationNumber, identity.role, identity.id]) !== key(target)) throw new NativeApiError('cancelled');
  };
  const checkSignal = (signal?: AbortSignal) => { check(); if (signal?.aborted) throw new NativeApiError('cancelled'); };
  const commit = (input: StudentStorePurchase): StorePurchaseResult => {
    const stored = server.orders.get(input.requestId);
    if (stored) return { ...stored, storeBalance: server.balance, alreadySynced: true };
    const item = server.products.find(row => row.id === input.productId);
    if (!server.enabled || !item?.isActive || item.stock === 0) throw new NativeApiError('conflict', 409);
    if (server.balance < item.pointsPrice) throw new NativeApiError('validation', 422);
    server.balance -= item.pointsPrice; server.commits += 1;
    server.products = server.products.map(row => row.id === input.productId && row.stock !== null ? { ...row, stock: row.stock - 1 } : row);
    const result: StorePurchaseResult = { ok: true, orderId: 31 + server.commits, purchaseDate: input.purchaseDate, storeBalance: server.balance, alreadySynced: false };
    server.orders.set(input.requestId, result); return result;
  };
  const api: StudentStoreApi = {
    scopeKey: () => key(target), getScope: () => { check(); return target; }, assertActive: check,
    async load(signal): Promise<StudentStoreSnapshot> {
      checkSignal(signal); calls.push({ kind: 'load' }); await options.load?.(signal); checkSignal(signal);
      return { scope: target, scopeKey: key(target), enabled: server.enabled,
        products: server.enabled ? structuredClone(server.products.filter(row => row.isActive && row.stock !== 0)) : [], storeBalance: server.enabled ? server.balance : null };
    },
    async purchase(input, signal) {
      checkSignal(signal); calls.push({ kind: 'purchase', input: { productId: input.productId, requestId: input.requestId, purchaseDate: input.purchaseDate } });
      const result = options.purchase ? await options.purchase(input, signal) : commit(input); checkSignal(signal); return result;
    },
  };
  return { api, server, calls, commit, logout: () => { active = false; }, change: (patch: Partial<typeof identity>) => { identity = { ...identity, ...patch }; } };
}
async function persisted(storage: StudentStoreStorage, value: StudentStoreScope = scope) { return decodeStoredStudentStore(await storage.read(key(value)), value, key(value)); }
async function selected(coordinator: ReturnType<typeof createStudentStoreCoordinator>): Promise<StoreProduct> {
  const item = (await coordinator.load()).products[0]; assert.ok(item); return item;
}
function make(f: ReturnType<typeof fixture>, storage: StudentStoreStorage, options: { owner?: object; now?: () => Date; uuid?: () => string } = {}) {
  return createStudentStoreCoordinator(f.api, storage, { uuid: options.uuid ?? uuids().next, now: options.now ?? (() => instant), owner: options.owner });
}

test('durable queued and sending reservations both precede the first purchase POST', async () => {
  const base = createMemoryStudentStoreStorage(), events: string[] = [];
  const storage: StudentStoreStorage = { read: value => base.read(value), update: (value, change) => base.update(value, current => {
    const next = change(current); if (next.actions.length) events.push(next.actions[0]!.status); return next;
  }) };
  const f = fixture({ purchase: async input => { events.push('POST'); assert.equal((await persisted(base)).actions[0]?.status, 'sending'); return f.commit(input); } });
  const coordinator = make(f, storage); await coordinator.purchase(await selected(coordinator));
  assert.ok(events.indexOf('queued') < events.indexOf('POST')); assert.ok(events.indexOf('sending') < events.indexOf('POST'));
  assert.equal((await persisted(base)).actions[0]?.status, 'synced'); assert.equal(f.server.commits, 1);
});
test('a double press returns one operation, UUID and local reservation', async () => {
  const storage = createMemoryStudentStoreStorage(), ids = uuids(), gate = deferred();
  const f = fixture({ purchase: async () => { await gate.promise; throw new NativeApiError('network'); } }), coordinator = make(f, storage, { uuid: ids.next });
  const item = await selected(coordinator), first = coordinator.purchase(item), second = coordinator.purchase(item); assert.equal(first, second); gate.resolve();
  const result = await first; assert.equal(result.state, 'queued'); assert.equal(result.snapshot.pendingCount, 1); assert.equal(result.snapshot.storeBalance, 16.5); assert.equal(result.snapshot.products[0]?.stock, 2);
  assert.equal(ids.count(), 1); assert.equal((await persisted(storage)).actions.length, 1); assert.equal(f.calls.filter(call => call.kind === 'purchase').length, 1);
});
test('same authenticated owner and scope return the same coordinator across API factories', () => {
  const storage = createMemoryStudentStoreStorage(), owner = {}, first = fixture(), second = fixture();
  assert.equal(make(first, storage, { owner }), make(second, storage, { owner }));
});
test('parallel coordinators share atomic eligibility and cannot reserve the last item twice', async () => {
  const storage = createMemoryStudentStoreStorage(), server = remote(); server.products = [{ ...product, stock: 1 }]; server.balance = 8;
  let barrier = false, arrivals = 0; const gate = deferred();
  const load = async () => { if (barrier) { arrivals += 1; if (arrivals === 2) gate.resolve(); await gate.promise; } };
  const purchase = async () => { throw new NativeApiError('network'); };
  const first = fixture({ remote: server, load, purchase }), second = fixture({ remote: server, load, purchase });
  const a = make(first, storage, { uuid: uuids().next }), ids = uuids(); ids.next(); const b = make(second, storage, { uuid: ids.next });
  const itemA = await selected(a), itemB = await selected(b); barrier = true;
  const results = await Promise.allSettled([a.purchase(itemA), b.purchase(itemB)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await persisted(storage)).actions.length, 1); assert.equal([...first.calls, ...second.calls].filter(call => call.kind === 'purchase').length, 1);
});
for (const changed of ['balance', 'stock'] as const) test(`atomic reservation sees a concurrent ${changed} update after the fresh catalog read`, async () => {
  const base = createMemoryStudentStoreStorage(), written = deferred(), release = deferred(); let armed = false;
  const storage: StudentStoreStorage = { read: value => base.read(value), update: async (value, change) => {
    const next = await base.update(value, change);
    if (armed && next.actions.length === 0) { armed = false; written.resolve(); await release.promise; }
    return next;
  } }, f = fixture(), coordinator = make(f, storage), item = await selected(coordinator);
  armed = true; const buying = coordinator.purchase(item); await written.promise;
  await base.update(key(scope), raw => {
    const current = decodeStoredStudentStore(raw, scope, key(scope)); assert.ok(current.snapshot);
    return { ...current, snapshot: { ...current.snapshot, storeBalance: changed === 'balance' ? 7.5 : current.snapshot.storeBalance,
      products: changed === 'stock' ? [] : current.snapshot.products } };
  });
  release.resolve(); await assert.rejects(buying, changed === 'balance' ? /رصيد المتجر غير كاف/ : code('conflict'));
  assert.equal((await persisted(base)).actions.length, 0); assert.equal(f.calls.some(call => call.kind === 'purchase'), false);
});
test('cold coordinator recreation retains the saved UUID and original business date', async () => {
  const storage = createMemoryStudentStoreStorage(), ids = uuids(), first = fixture({ purchase: async () => { throw new NativeApiError('network'); } });
  const coordinator = make(first, storage, { uuid: ids.next }); await coordinator.purchase(await selected(coordinator)); const original = (await persisted(storage)).actions[0]!;
  const laterIds = uuids(), second = fixture({ remote: first.server }), cold = make(second, storage, { now: () => new Date('2026-10-16T10:00:00.000Z'), uuid: laterIds.next });
  const result = await cold.load(); assert.equal(result.pendingCount, 0); assert.equal(second.server.commits, 1);
  assert.deepEqual(second.calls.find(call => call.kind === 'purchase')?.input, { productId: original.productId, requestId: original.requestId, purchaseDate: original.purchaseDate }); assert.equal(laterIds.count(), 0);
});
test('a committed purchase with lost reply resyncs one server commit and one local stock decrement', async () => {
  const storage = createMemoryStudentStoreStorage();
  const first = fixture({ purchase: async input => { first.commit(input); throw new NativeApiError('network'); } });
  const coordinator = make(first, storage), result = await coordinator.purchase(await selected(coordinator)); assert.equal(result.snapshot.storeBalance, 16.5); assert.equal(first.server.commits, 1);
  const second = fixture({ remote: first.server }), confirmed = await make(second, storage).reconcile();
  assert.equal(confirmed.pendingCount, 0); assert.equal(confirmed.storeBalance, 16.5); assert.equal(confirmed.products[0]?.stock, 2); assert.equal(second.server.commits, 1);
  assert.deepEqual(first.calls.find(call => call.kind === 'purchase')?.input, second.calls.find(call => call.kind === 'purchase')?.input);
});
for (const status of [409, 422]) test(`unknown commit followed by ${status} remains reserved and blocks a new purchase`, async () => {
  const storage = createMemoryStudentStoreStorage();
  const first = fixture({ purchase: async input => { first.commit(input); throw new NativeApiError('timeout'); } }); const coordinator = make(first, storage);
  await coordinator.purchase(await selected(coordinator)); const fixed = (await persisted(storage)).actions[0]!;
  const second = fixture({ remote: first.server, purchase: async () => { throw new NativeApiError(status === 409 ? 'conflict' : 'validation', status); } }), ids = uuids(), cold = make(second, storage, { uuid: ids.next });
  const view = await cold.load(); assert.equal(view.pendingCount, 1); assert.equal(view.storeBalance, 16.5); assert.equal(view.products[0]?.stock, 2);
  assert.equal((await persisted(storage)).actions[0]?.status, 'uncertain'); await assert.rejects(cold.purchase(view.products[0]!), pendingMessage); assert.equal(ids.count(), 0);
  assert.equal(first.server.commits, 1); assert.equal(second.calls.filter(call => call.kind === 'purchase').length, 1); assert.equal(second.calls.find(call => call.kind === 'purchase')?.input?.requestId, fixed.requestId);
});
test('first definitive 422 releases the reservation without claiming a commit or losing the rejected audit', async () => {
  const storage = createMemoryStudentStoreStorage(), f = fixture({ purchase: async () => { throw new NativeApiError('validation', 422); } }), coordinator = make(f, storage);
  await assert.rejects(coordinator.purchase(await selected(coordinator)), /تحقق/); const saved = await persisted(storage);
  assert.equal(saved.actions[0]?.status, 'rejected'); assert.equal(saved.actions[0]?.result, null); assert.equal(f.server.commits, 0);
  const view = await coordinator.load(); assert.equal(view.pendingCount, 0); assert.equal(view.storeBalance, 24.5); assert.equal(view.products[0]?.stock, 3);
});
test('fresh server balance after an unconfirmed commit is never double-subtracted', async () => {
  const storage = createMemoryStudentStoreStorage(); let failBeforeCommit = false;
  const f = fixture({ purchase: async input => { if (!failBeforeCommit) { failBeforeCommit = true; f.commit(input); } throw new NativeApiError('network'); } });
  const coordinator = make(f, storage); await coordinator.purchase(await selected(coordinator));
  for (let attempt = 0; attempt < 2; attempt += 1) { const view = await coordinator.load(); assert.equal(view.storeBalance, 16.5); assert.equal(view.products[0]?.stock, 2); }
  assert.equal((await persisted(storage)).snapshot?.storeBalance, 24.5); assert.equal((await persisted(storage)).snapshot?.products[0]?.stock, 3); assert.equal(f.server.commits, 1);
});
test('known new price during an unknown purchase cannot enable another purchase at the old price', async () => {
  const storage = createMemoryStudentStoreStorage(), f = fixture({ purchase: async () => { throw new NativeApiError('network'); } }), coordinator = make(f, storage);
  await coordinator.purchase(await selected(coordinator)); f.server.products = [{ ...product, pointsPrice: 20 }];
  const view = await coordinator.reconcile(); await assert.rejects(coordinator.purchase(view.products[0]!), pendingMessage); assert.equal(f.calls.filter(call => call.kind === 'purchase').length, 2); assert.equal((await persisted(storage)).actions.length, 1);
});
for (const patch of [{ pointsPrice: 9 }, { stock: 2 }, { stock: 0 }, { isActive: false }, { name: 'ChangedFixture' }]) test(`fresh product ${JSON.stringify(patch)} rejects the stale confirmation before POST`, async () => {
  const storage = createMemoryStudentStoreStorage(), f = fixture(), coordinator = make(f, storage), item = await selected(coordinator);
  f.server.products = [{ ...product, ...patch }]; await assert.rejects(coordinator.purchase(item), code('conflict'));
  assert.equal((await persisted(storage)).actions.length, 0); assert.equal(f.calls.some(call => call.kind === 'purchase'), false);
});
test('fresh insufficient balance fails within eligibility transaction before reservation or POST', async () => {
  const storage = createMemoryStudentStoreStorage(), f = fixture(), coordinator = make(f, storage), item = await selected(coordinator); f.server.balance = 7.5;
  await assert.rejects(coordinator.purchase(item), /رصيد المتجر غير كاف/); assert.equal((await persisted(storage)).actions.length, 0); assert.equal(f.calls.some(call => call.kind === 'purchase'), false);
});
test('403 catalog read persists hidden visibility across a later offline fallback', async () => {
  const storage = createMemoryStudentStoreStorage(); let failure: NativeApiError | null = null;
  const f = fixture({ load: async () => { if (failure) throw failure; } }), coordinator = make(f, storage); await coordinator.load();
  failure = new NativeApiError('forbidden', 403); await assert.rejects(coordinator.load(), code('forbidden')); assert.equal((await persisted(storage)).visible, false);
  failure = new NativeApiError('network'); const view = await coordinator.load(); assert.equal(view.enabled, false); assert.equal(view.products.length, 0); assert.equal(view.storeBalance, null);
});
test('a 403 hides cached payload without deleting the private uncertain ledger', async () => {
  const storage = createMemoryStudentStoreStorage(); let failure: NativeApiError | null = null;
  const f = fixture({ load: async () => { if (failure) throw failure; }, purchase: async () => { throw new NativeApiError('network'); } }), coordinator = make(f, storage);
  await coordinator.purchase(await selected(coordinator)); failure = new NativeApiError('forbidden', 403); await assert.rejects(coordinator.load(), code('forbidden'));
  failure = new NativeApiError('network'); const view = await coordinator.load(); assert.equal(view.enabled, false); assert.equal(view.products.length, 0); assert.equal(view.storeBalance, null);
  assert.equal(view.pendingCount, 1); assert.equal((await persisted(storage)).actions[0]?.status, 'uncertain');
});
for (const change of [{ apiBase: 'https://other-store.invalid/api' }, { registrationNumber: 'other-store-queue' }, { id: 8 }]) test(`cached state is isolated from scope ${JSON.stringify(change)}`, async () => {
  const storage = createMemoryStudentStoreStorage(), first = fixture(); await make(first, storage).load();
  const otherScope = { ...scope, ...change }, second = fixture({ scope: otherScope, load: async () => { throw new NativeApiError('network'); } });
  await assert.rejects(make(second, storage).load(), code('network')); assert.equal((await persisted(storage)).snapshot?.scope.id, 7); assert.equal(await storage.read(key(otherScope)), null);
});
for (const change of [{ apiBase: 'https://other-store.invalid/api' }, { registrationNumber: 'other-store-queue' }, { id: 8 }, { role: 'admin' }]) test(`old coordinator rejects changed identity ${JSON.stringify(change)} before new I/O`, async () => {
  const storage = createMemoryStudentStoreStorage(), f = fixture(), coordinator = make(f, storage), item = await selected(coordinator), count = f.calls.length;
  f.change(change); await assert.rejects(coordinator.purchase(item), code('cancelled')); await assert.rejects(coordinator.load(), code('cancelled')); assert.equal(f.calls.length, count);
});
test('late logout retains sending UUID after a remote commit and prevents an old-account success', async () => {
  const storage = createMemoryStudentStoreStorage(), entered = deferred(), release = deferred();
  const f = fixture({ purchase: async input => { const result = f.commit(input); entered.resolve(); await release.promise; return result; } });
  const coordinator = make(f, storage), buying = coordinator.purchase(await selected(coordinator)); await entered.promise; f.logout(); release.resolve(); await assert.rejects(buying, code('unauthorized'));
  assert.equal((await persisted(storage)).actions[0]?.status, 'sending'); const count = f.calls.length; await assert.rejects(coordinator.load(), code('unauthorized')); assert.equal(f.calls.length, count);
  const next = fixture({ remote: f.server }), view = await make(next, storage).load(); assert.equal(view.pendingCount, 0); assert.equal(f.server.commits, 1);
});
test('late cancellation cannot release an uncertain committed UUID or expose a success', async () => {
  const storage = createMemoryStudentStoreStorage(), first = fixture({ purchase: async () => { throw new NativeApiError('network'); } }); const initial = make(first, storage);
  await initial.purchase(await selected(initial)); const entered = deferred(), release = deferred();
  const next = fixture({ remote: first.server, purchase: async input => { const result = next.commit(input); entered.resolve(); await release.promise; return result; } });
  const coordinator = make(next, storage), signal = new AbortController(), loading = coordinator.load(signal.signal);
  await entered.promise; signal.abort(); release.resolve(); await assert.rejects(loading, code('cancelled')); assert.equal((await persisted(storage)).actions[0]?.status, 'uncertain');
  assert.equal((await coordinator.load()).pendingCount, 0); assert.equal(next.server.commits, 1);
});
test('a pre-aborted load is rejected without any API request', async () => {
  const f = fixture(), coordinator = make(f, createMemoryStudentStoreStorage()), signal = new AbortController(); signal.abort();
  await assert.rejects(coordinator.load(signal.signal), code('cancelled')); assert.equal(f.calls.length, 0);
});
test('corrupt persisted scope, version, dates or duplicate UUIDs fail closed before API', async () => {
  const seedStorage = createMemoryStudentStoreStorage(), f = fixture({ purchase: async () => { throw new NativeApiError('network'); } }), coordinator = make(f, seedStorage);
  await coordinator.purchase(await selected(coordinator)); const valid = await persisted(seedStorage);
  for (const invalid of [{ ...valid, version: 2 }, { ...valid, scope: { ...scope, id: 8 } }, { ...valid, snapshotAt: 'bad' }, { ...valid, actions: [...valid.actions, ...valid.actions] }, { ...valid, actions: [{ ...valid.actions[0], purchaseDate: '2026-02-30' }] }]) {
    const storage: StudentStoreStorage = { read: async () => invalid, update: async () => { throw new Error('Unexpected write'); } }, next = fixture();
    await assert.rejects(make(next, storage).load(), code('storage')); assert.equal(next.calls.length, 0);
  }
});
test('initial storage failure and failed atomic reservation never dispatch a purchase', async () => {
  const broken: StudentStoreStorage = { read: async () => { throw new NativeApiError('storage'); }, update: async () => { throw new NativeApiError('storage'); } }, initial = fixture();
  await assert.rejects(make(initial, broken).load(), code('storage')); assert.equal(initial.calls.length, 0);
  const base = createMemoryStudentStoreStorage(), storage: StudentStoreStorage = { read: value => base.read(value), update: (value, change) => base.update(value, current => {
    const next = change(current); if (next.actions.length) throw new NativeApiError('storage'); return next;
  }) }, f = fixture(), coordinator = make(f, storage);
  await assert.rejects(coordinator.purchase(await selected(coordinator)), code('storage')); assert.equal(f.calls.some(call => call.kind === 'purchase'), false); assert.equal((await persisted(base)).actions.length, 0);
});
test('storage failure after actual reply keeps sending and later resyncs exactly its saved UUID', async () => {
  const base = createMemoryStudentStoreStorage(); let failing = true;
  const storage: StudentStoreStorage = { read: value => base.read(value), update: (value, change) => base.update(value, current => {
    const next = change(current); if (failing && next.actions.some(row => ['synced', 'uncertain'].includes(row.status))) throw new NativeApiError('storage'); return next;
  }) }, first = fixture(), coordinator = make(first, storage);
  await assert.rejects(coordinator.purchase(await selected(coordinator)), code('storage')); const action = (await persisted(base)).actions[0]!;
  assert.equal(action.status, 'sending'); assert.equal(first.server.commits, 1); failing = false;
  const second = fixture({ remote: first.server }), restored = await make(second, storage).load(); assert.equal(restored.pendingCount, 0); assert.equal(restored.storeBalance, 16.5); assert.equal(restored.products[0]?.stock, 2);
  assert.equal(second.server.commits, 1); assert.equal(second.calls.find(call => call.kind === 'purchase')?.input?.requestId, action.requestId);
});
test('a failed storage callback leaves the record untouched and preserves its cancellation cause', async () => {
  const storage = createMemoryStudentStoreStorage(), seed: StoredStudentStore = emptyStoredStudentStore(scope); await storage.update(key(scope), () => seed);
  const cause = new NativeApiError('cancelled'); await assert.rejects(storage.update(key(scope), () => { throw cause; }), error => error === cause); assert.deepEqual(await storage.read(key(scope)), seed);
});
test('trusted API namespace comes from createNativeSession, never an arbitrary controller mock', async () => {
  const identity = { role: 'student' as const, id: 7, name: 'NamespaceFixture', dashboardPermissions: [], complex: { registrationNumber: scope.registrationNumber, name: 'Fixture' } };
  const storage: SessionStorage = { load: async () => null, save: async () => {}, clear: async () => {} };
  const api: NativeApi = { baseUrl: scope.apiBase, login: async () => ({ ...identity, token: 'a'.repeat(64) }), session: async () => identity, logout: async () => {}, request: async () => { throw new Error('Unexpected I/O'); } };
  const controller = createNativeSession({ api, storage }); await controller.login({ loginNumber: '940001', password: '', registrationNumber: scope.registrationNumber });
  assert.equal(nativeSessionApiBase(controller), scope.apiBase); assert.throws(() => nativeSessionApiBase({ getSnapshot: controller.getSnapshot } as NativeSessionController), code('configuration'));
});
