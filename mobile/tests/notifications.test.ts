import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyNotificationSelection, normalizeNotificationDraft, normalizeNotificationReadIds, notificationPersonSelected,
  selectedNotificationPeople, type NotificationAudience, type NotificationDraft } from '../src/domain/notifications';
import { createNativeSession, type NativeSession, type NativeSessionController, type NativeSessionSnapshot,
  type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createAccountNotificationsApi, createNotificationsManagementApi, decodeAccountNotification, decodeNotificationAudience,
  decodeNotificationHistory, decodeNotificationRecipient, decodeNotificationSendResult } from '../src/services/notificationsApi';

const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [],
  complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const delegate: NativeSession = { ...identity, role: 'admin', dashboardPermissions: ['notifications'] };
const audience: NotificationAudience = { people: [
  { role: 'student', id: 1, name: 'طالب أ', committeeId: 3 }, { role: 'student', id: 2, name: 'طالب ب', committeeId: 4 },
  { role: 'supervisor', id: 1, name: 'مشرف', committeeId: null }, { role: 'admin', id: 1, name: 'إداري', committeeId: null },
  { role: 'manager', id: 1, name: 'مدير', committeeId: null },
], committees: [{ id: 3, name: 'حلقة أ' }, { id: 4, name: 'حلقة ب' }] };
const history = { id: 9, title: 'نخب', body: 'نص', createdBy: 'إدارة', createdAt: '2026-10-15 10:00',
  recipientCount: 3, readCount: 1, pushSent: 2, pushPending: 0, pushFailed: 1 };
const inbox = { id: '9', title: 'نخب', body: 'نص', createdAt: '2026-10-15 10:00', isRead: false };
const uuid = '12345678-1234-4234-8234-123456789abc';
const draft = (): NotificationDraft => ({ title: ' نخب ', body: ' رسالة ', selection: { ...emptyNotificationSelection(), people: ['student:1'] } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const isCode = (code: string) => (error: unknown) => error instanceof NativeApiError && error.code === code;
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const token = 'a'.repeat(64);
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}
function mutableController(actor: NativeSession, handle: (path: string, body: unknown) => Promise<unknown>) {
  let snapshot: NativeSessionSnapshot = { status: 'authenticated', session: actor, error: null }; const listeners = new Set<() => void>();
  const change = (next: NativeSession | null) => { snapshot = { status: next ? 'authenticated' : 'signed-out', session: next, error: null }; listeners.forEach(listener => listener()); };
  const controller: NativeSessionController = {
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    login: async () => {}, restore: async () => {}, cancel: () => {},
    logout: async () => { change(null); return { localCleared: true, serverRevoked: true, error: null }; },
    async request<T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (value: unknown) => T): Promise<T> {
      const value = await handle(path, options?.body); return decode ? decode(value) : value as T;
    },
  };
  return { controller, change };
}
test('notification selections cover roles, circles and role-qualified people without duplicate recipients', () => {
  const selection = { roles: ['student' as const], committeeIds: ['3'], people: ['student:1', 'supervisor:1'] };
  assert.equal(selectedNotificationPeople(audience, selection).length, 3);
  assert.equal(notificationPersonSelected(audience.people[3]!, selection), false);
  const normalized = normalizeNotificationDraft({ ...draft(), selection: { roles: ['student', 'student'], committeeIds: ['3', '3'], people: ['supervisor:1', 'student:1', 'student:1'] } }, audience);
  assert.deepEqual(normalized.selection, { roles: ['student'], committeeIds: ['3'], people: ['student:1', 'supervisor:1'] });
  assert.equal(normalized.title, 'نخب'); assert.equal(normalized.body, 'رسالة');
});
test('notification validation refuses empty, stale or unknown audiences and server length violations', () => {
  for (const partial of [{ title: '' }, { title: 'x'.repeat(181) }, { body: '  ' }, { body: 'x'.repeat(4001) },
    { selection: emptyNotificationSelection() }, { selection: { ...emptyNotificationSelection(), committeeIds: ['99'] } },
    { selection: { ...emptyNotificationSelection(), people: ['reciter:1'] } },
    { selection: { ...emptyNotificationSelection(), roles: ['reciter'] } }]) {
    assert.throws(() => normalizeNotificationDraft({ ...draft(), ...partial } as NotificationDraft, audience), isCode('validation'));
  }
  assert.throws(() => normalizeNotificationDraft(draft(), { people: [], committees: [] }), isCode('validation'));
});
test('read identifiers deduplicate and enforce the existing bounded numeric batch contract', () => {
  assert.deepEqual(normalizeNotificationReadIds(['9', '9', '10']), ['9', '10']); assert.deepEqual(normalizeNotificationReadIds([]), []);
  for (const ids of [['0'], ['-1'], ['1.1'], ['9/../read'], ['9007199254740992'], Array.from({ length: 101 }, (_, index) => String(index + 1))]) {
    assert.throws(() => normalizeNotificationReadIds(ids), isCode('validation'));
  }
});
test('notification decoders accept SQL counts and preserve unread and push status semantics', () => {
  assert.equal(decodeNotificationHistory({ ...history, id: '9', readCount: '1', pushSent: '2' }).pushSent, 2);
  assert.equal(decodeNotificationAudience(audience).people.length, 5);
  assert.deepEqual(decodeNotificationRecipient({ id: '1', role: 'student', name: 'طالب', readAt: null }), { id: 1, role: 'student', name: 'طالب', readAt: null });
  assert.equal(decodeAccountNotification(inbox).isRead, false);
  assert.deepEqual(decodeNotificationSendResult({ duplicate: true }), { id: null, duplicate: true, recipientCount: null });
  assert.deepEqual(decodeNotificationSendResult({ id: 9, recipientCount: 3 }), { id: 9, duplicate: false, recipientCount: 3 });
});
test('notification decoders reject malformed identities, counts, read states and acknowledgements', () => {
  for (const partial of [{ id: true }, { id: 0 }, { readCount: 4 }, { pushPending: -1 }, { pushSent: 'NaN' }, { title: null }]) {
    assert.throws(() => decodeNotificationHistory({ ...history, ...partial }), isCode('invalid-response'));
  }
  for (const value of [{ ...audience, people: [...audience.people, audience.people[0]] }, { ...audience, committees: [{ id: 0, name: '' }] },
    { ...audience, people: [{ ...audience.people[2], committeeId: 3 }] }, { people: [], committees: null }]) assert.throws(() => decodeNotificationAudience(value), isCode('invalid-response'));
  for (const partial of [{ isRead: 1 }, { id: 'x' }, { createdAt: null }, { body: 3 }]) assert.throws(() => decodeAccountNotification({ ...inbox, ...partial }), isCode('invalid-response'));
  for (const value of [{}, { ok: true }, { id: 9 }, { duplicate: false }, { id: 9, recipientCount: -1 }]) assert.throws(() => decodeNotificationSendResult(value), isCode('invalid-response'));
});
test('inbox discards destination fields instead of inventing a navigation contract', () => {
  const value = decodeAccountNotification({ ...inbox, destination: '/ungranted', route: 'settings', token: 'secret' });
  assert.deepEqual(value, inbox); assert.equal('destination' in value, false);
});
test('management loads actual audience, history and per-notification recipients endpoints', async () => {
  const calls: string[] = [];
  const api = createNotificationsManagementApi(await setup(async url => {
    const path = new URL(url).pathname.replace('/api', ''); calls.push(path);
    return json(path.endsWith('/audience') ? audience : path.endsWith('/recipients') ? [{ id: 1, role: 'student', name: 'طالب', readAt: null }] : [history]);
  }, delegate), { uuid: () => uuid });
  const loaded = await api.load(); assert.equal(loaded.history[0]!.recipientCount, 3); assert.equal(loaded.audience.people.length, 5);
  assert.equal((await api.loadRecipients(9))[0]!.readAt, null);
  assert.deepEqual(calls.sort(), ['/notification-management', '/notification-management/9/recipients', '/notification-management/audience']);
});
test('notification sending uses one immutable UUID payload and the existing successful response', async () => {
  let sent: unknown; let uuids = 0;
  const api = createNotificationsManagementApi(await setup(async (_url, options) => { sent = JSON.parse(String(options.body)); assert.equal(options.method, 'POST'); return json({ id: 9, recipientCount: 1 }, 201); }), { uuid: () => { uuids += 1; return uuid; } });
  assert.equal((await api.send(draft(), audience)).id, 9); assert.equal(api.pending(), null); assert.equal(uuids, 1);
  assert.deepEqual(sent, { title: 'نخب', body: 'رسالة', selection: { roles: [], committeeIds: [], people: ['student:1'] }, requestId: uuid });
});
test('unknown send is retained across factory remount, blocks payload changes and retries the exact UUID', async () => {
  const sent: unknown[] = []; let count = 0, uuids = 0;
  const controller = await setup(async (_url, options) => { sent.push(JSON.parse(String(options.body))); count += 1;
    if (count === 1) throw new Error('response lost'); return json({ id: 9, duplicate: true }); });
  const api = createNotificationsManagementApi(controller, { uuid: () => { uuids += 1; return uuid; } });
  await assert.rejects(api.send(draft(), audience), isCode('network')); const original = api.pending(); assert.equal(original?.requestId, uuid);
  assert.equal(Object.isFrozen(original), true); assert.equal(Object.isFrozen(original?.selection.people), true);
  const remounted = createNotificationsManagementApi(controller, { uuid: () => { throw new Error('must not mint another UUID'); } });
  await assert.rejects(remounted.send({ ...draft(), body: 'تغير النص' }, audience), isCode('conflict'));
  assert.equal(count, 1); assert.equal((await remounted.retryPending()).duplicate, true);
  assert.equal(remounted.pending(), null); assert.equal(uuids, 1); assert.deepEqual(sent[0], sent[1]);
});
test('concurrent sends through different factories share one wire request', async () => {
  let finish: ((value: Response) => void) | undefined; let requests = 0, uuids = 0;
  const controller = await setup(async () => { requests += 1; return new Promise<Response>(resolve => { finish = resolve; }); });
  const options = { uuid: () => { uuids += 1; return uuid; } };
  const one = createNotificationsManagementApi(controller, options), two = createNotificationsManagementApi(controller, options);
  const first = one.send(draft(), audience), second = two.send(draft(), audience);
  finish!(json({ id: 9, recipientCount: 1 })); await Promise.all([first, second]); assert.equal(requests, 1); assert.equal(uuids, 1);
});
test('ambiguous malformed acknowledgements retain the pending operation and never retry automatically', async () => {
  let requests = 0;
  const api = createNotificationsManagementApi(await setup(async () => { requests += 1; return json({ ok: true }); }), { uuid: () => uuid });
  await assert.rejects(api.send(draft(), audience), isCode('invalid-response')); assert.equal(api.pending()?.requestId, uuid); assert.equal(requests, 1);
});
test('a definite first validation rejection allows correction but a rejection after uncertainty keeps the lock', async () => {
  const api = createNotificationsManagementApi(await setup(async () => json({}, 422)), { uuid: () => uuid });
  await assert.rejects(api.send(draft(), audience), isCode('validation')); assert.equal(api.pending(), null);
  let requests = 0;
  const uncertain = createNotificationsManagementApi(await setup(async () => { requests += 1; if (requests === 1) throw new Error('lost'); return json({}, 422); }), { uuid: () => uuid });
  await assert.rejects(uncertain.send(draft(), audience), isCode('network'));
  await assert.rejects(uncertain.retryPending(), isCode('validation')); assert.equal(uncertain.pending()?.requestId, uuid);
});
test('manager and explicitly granted supervisor or administrator can manage without an invented flag', async () => {
  for (const actor of [identity, delegate, { ...delegate, role: 'supervisor' as const }]) {
    const api = createNotificationsManagementApi(await setup(async url => json(url.endsWith('/audience') ? audience : []), actor), { uuid: () => uuid });
    assert.equal(api.canManage(), true); await api.load();
  }
});
test('ungranted staff and students cannot read audiences, history, recipients or send even with forged grants', async () => {
  for (const actor of [{ ...delegate, dashboardPermissions: [] }, { ...delegate, role: 'student' as const }]) {
    let requests = 0; const api = createNotificationsManagementApi(await setup(async () => { requests += 1; return json([]); }, actor), { uuid: () => uuid });
    assert.equal(api.canManage(), false); await assert.rejects(api.load(), isCode('forbidden'));
    assert.throws(() => api.loadRecipients(9), isCode('forbidden'));
    await assert.rejects(api.send(draft(), audience), isCode('forbidden')); await assert.rejects(api.retryPending(), isCode('forbidden')); assert.equal(requests, 0);
  }
});
test('invalid notification inputs and recipient IDs stop before networking or UUID creation', async () => {
  let requests = 0, uuids = 0; const api = createNotificationsManagementApi(await setup(async () => { requests += 1; return json([]); }), { uuid: () => { uuids += 1; return uuid; } });
  await assert.rejects(api.send({ ...draft(), body: '' }, audience), isCode('validation'));
  for (const id of [0, -1, 1.5, NaN]) await assert.rejects(api.loadRecipients(id), isCode('validation'));
  assert.equal(requests, 0); assert.equal(uuids, 0);
});
for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation'], [429, 'rate-limited'], [500, 'server']] as const) {
  test(`notification management safely surfaces HTTP ${status} as ${code}`, async () => {
    const api = createNotificationsManagementApi(await setup(async () => json({ message: 'private internal detail' }, status)), { uuid: () => uuid });
    await assert.rejects(api.load(), cause => isCode(code)(cause) && cause instanceof Error && !cause.message.includes('private'));
    if (status === 403) assert.equal(api.canManage(), false);
  });
}
test('notification HTTP 401 signs out and removes account and management access', async () => {
  const controller = await setup(async () => json({}, 401)); const account = createAccountNotificationsApi(controller);
  const admin = createNotificationsManagementApi(controller, { uuid: () => uuid });
  await assert.rejects(account.load(), isCode('unauthorized')); assert.equal(controller.getSnapshot().status, 'signed-out');
  assert.equal(account.canRead(), false); assert.equal(admin.canManage(), false);
});
test('old notification APIs reject account, role and tenant changes before reads or writes', async () => {
  for (const next of [null, { ...delegate, id: 9 }, { ...delegate, role: 'manager' as const },
    { ...delegate, complex: { ...delegate.complex, registrationNumber: 'other-fixture' } }]) {
    let requests = 0; const state = mutableController(delegate, async () => { requests += 1; return []; });
    const api = createNotificationsManagementApi(state.controller, { uuid: () => uuid }), account = createAccountNotificationsApi(state.controller); state.change(next);
    await assert.rejects(api.load(), isCode(next ? 'cancelled' : 'unauthorized'));
    await assert.rejects(api.send(draft(), audience), isCode(next ? 'cancelled' : 'unauthorized'));
    await assert.rejects(account.markRead(['9']), isCode(next ? 'cancelled' : 'unauthorized')); assert.equal(requests, 0);
  }
});
test('notification APIs discard late management and inbox responses after identity changes', async () => {
  for (const management of [true, false]) {
    const state = mutableController(delegate, async path => { state.change({ ...delegate, id: 99 }); return path.endsWith('/audience') ? audience : management ? [history] : [inbox]; });
    await assert.rejects(management ? createNotificationsManagementApi(state.controller, { uuid: () => uuid }).load()
      : createAccountNotificationsApi(state.controller).load(), isCode('cancelled'));
  }
});
test('management grant is rechecked after delayed send and before retrying an uncertain request', async () => {
  const state = mutableController(delegate, async () => { state.change({ ...delegate, dashboardPermissions: [] }); return { id: 9, recipientCount: 1 }; });
  const api = createNotificationsManagementApi(state.controller, { uuid: () => uuid });
  await assert.rejects(api.send(draft(), audience), isCode('forbidden')); assert.equal(api.canManage(), false);
  await assert.rejects(api.retryPending(), isCode('forbidden'));
  state.change(delegate); assert.equal(api.pending()?.requestId, uuid);
});
test('a pending send never transfers to another controller or tenant', async () => {
  const first = createNotificationsManagementApi(await setup(async () => { throw new Error('lost'); }), { uuid: () => uuid });
  await assert.rejects(first.send(draft(), audience), isCode('network'));
  const controller = await setup(async () => json([])); assert.equal(createNotificationsManagementApi(controller, { uuid: () => uuid }).pending(), null);
  const mutable = mutableController(delegate, async () => { throw new NativeApiError('network'); });
  const original = createNotificationsManagementApi(mutable.controller, { uuid: () => uuid }); await assert.rejects(original.send(draft(), audience), isCode('network'));
  mutable.change({ ...delegate, complex: { ...delegate.complex, registrationNumber: 'other' } });
  assert.equal(createNotificationsManagementApi(mutable.controller, { uuid: () => uuid }).pending(), null);
});
test('all four authenticated roles read only the shared inbox and post the bounded read batch', async () => {
  for (const role of ['student', 'supervisor', 'admin', 'manager'] as const) {
    const calls: { path: string; body: unknown }[] = [];
    const api = createAccountNotificationsApi(await setup(async (url, options) => {
      const path = new URL(url).pathname.replace('/api', ''); calls.push({ path, body: options.body ? JSON.parse(String(options.body)) : null });
      return json(path === '/notifications' ? [inbox] : { ok: true });
    }, { ...identity, role, dashboardPermissions: [] }));
    assert.equal((await api.load())[0]!.isRead, false); await api.markRead(['9', '9']);
    assert.deepEqual(calls, [{ path: '/notifications', body: null }, { path: '/notifications/read', body: { ids: ['9'] } }]);
  }
});
test('read failures preserve retryability without optimistic unread changes or silent automatic retries', async () => {
  let requests = 0; const api = createAccountNotificationsApi(await setup(async () => { requests += 1; throw new Error('lost'); }));
  await assert.rejects(api.markRead(['9']), isCode('network')); assert.equal(requests, 1);
  await assert.rejects(api.markRead(['9']), isCode('network')); assert.equal(requests, 2);
});
test('concurrent read batches are blocked and malformed read acknowledgements fail', async () => {
  let finish: ((value: Response) => void) | undefined; let requests = 0;
  const api = createAccountNotificationsApi(await setup(async () => { requests += 1; return new Promise<Response>(resolve => { finish = resolve; }); }));
  const first = api.markRead(['9']); await assert.rejects(api.markRead(['10']), isCode('conflict'));
  finish!(json({ ok: 'true' })); await assert.rejects(first, isCode('invalid-response')); assert.equal(requests, 1);
});
test('empty and invalid read batches avoid network and malformed duplicate inboxes are rejected', async () => {
  let requests = 0; const api = createAccountNotificationsApi(await setup(async () => { requests += 1; return json([inbox, inbox]); }));
  await api.markRead([]); await assert.rejects(api.markRead(['invalid']), isCode('validation')); assert.equal(requests, 0);
  await assert.rejects(api.load(), isCode('invalid-response'));
});
test('late read responses and server forbidden states cannot preserve access to old inbox data', async () => {
  const state = mutableController(identity, async () => { state.change(null); return { ok: true }; });
  const api = createAccountNotificationsApi(state.controller); await assert.rejects(api.markRead(['9']), isCode('unauthorized')); assert.equal(api.canRead(), false);
  let calls = 0, signals = 0; const forbidden = createAccountNotificationsApi(await setup(async () => { calls += 1; return json({}, 403); }));
  const unsubscribe = forbidden.subscribe(() => { signals += 1; });
  await assert.rejects(forbidden.load(), isCode('forbidden')); await assert.rejects(forbidden.markRead(['9']), isCode('forbidden'));
  unsubscribe(); assert.equal(calls, 1); assert.equal(signals, 1);
});
test('notification loads honor cancellation before any wire request', async () => {
  let requests = 0; const controller = await setup(async () => { requests += 1; return json([]); }); const abort = new AbortController(); abort.abort();
  await assert.rejects(createNotificationsManagementApi(controller, { uuid: () => uuid }).load(abort.signal), isCode('cancelled'));
  await assert.rejects(createAccountNotificationsApi(controller).load(abort.signal), isCode('cancelled')); assert.equal(requests, 0);
});
test('notification factories reject signed-out sessions', () => {
  const state = mutableController(identity, async () => []); state.change(null);
  assert.throws(() => createAccountNotificationsApi(state.controller), isCode('unauthorized'));
  assert.throws(() => createNotificationsManagementApi(state.controller, { uuid: () => uuid }), isCode('unauthorized'));
});
test('notification view keys change for API replacement and verified session refresh, forcing fresh screen data', async () => {
  const state = mutableController(delegate, async () => []);
  const one = createAccountNotificationsApi(state.controller), two = createAccountNotificationsApi(state.controller);
  const before = one.viewKey(); assert.equal(one.viewKey(), before); assert.notEqual(two.viewKey(), before);
  state.change({ ...delegate, dashboardPermissions: [] }); assert.notEqual(one.viewKey(), before);
});
test('restoring the verified session after a forbidden response permits a fresh management read', async () => {
  let requests = 0;
  const state = mutableController(delegate, async path => { requests += 1; if (requests <= 2) throw new NativeApiError('forbidden', 403);
    return path.endsWith('/audience') ? audience : [history]; });
  const api = createNotificationsManagementApi(state.controller, { uuid: () => uuid }); await assert.rejects(api.load(), isCode('forbidden'));
  assert.equal(api.canManage(), false); const before = api.viewKey(); state.change(delegate);
  assert.equal(api.canManage(), true); assert.notEqual(api.viewKey(), before);
  assert.equal((await api.load()).history.length, 1);
});
test('pending notification changes notify remounted factories and cannot mutate the stored original payload', async () => {
  let finish: ((value: Response) => void) | undefined, sent: unknown; let updates = 0;
  const controller = await setup(async (_url, options) => { sent = JSON.parse(String(options.body)); return new Promise<Response>(resolve => { finish = resolve; }); });
  const first = createNotificationsManagementApi(controller, { uuid: () => uuid }), remounted = createNotificationsManagementApi(controller, { uuid: () => uuid });
  const unsubscribe = remounted.subscribe(() => { updates += 1; }); const original = draft(); const sending = first.send(original, audience);
  original.body = 'تغير محلي'; original.selection.people.push('student:2');
  assert.equal(remounted.pendingSnapshot()?.body, 'رسالة'); assert.deepEqual(remounted.pendingSnapshot()?.selection.people, ['student:1']);
  assert.equal(updates, 1); finish!(json({ id: 9, recipientCount: 1 })); await sending;
  assert.equal(updates, 2); assert.equal(remounted.pendingSnapshot(), null); assert.equal((sent as { body: string }).body, 'رسالة'); unsubscribe();
});
