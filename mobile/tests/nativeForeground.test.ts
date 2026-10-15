import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSession, nativeExternalActivityPending, withVerifiedNativeExternalActivity,
  type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeApiErrorCode, type NativeFetch } from '../src/services/nativeApi';

const baseUrl = 'https://example.invalid/api';
const token = 'c'.repeat(64);
const otherToken = 'd'.repeat(64);
const identity: NativeSession = { role: 'admin', id: 41, name: 'حساب اختبار', dashboardPermissions: ['store', 'reports'],
  complex: { registrationNumber: 'foreground-fixture', name: 'جهة اختبار' } };
const login = { loginNumber: '0041', password: '', registrationNumber: identity.complex.registrationNumber };
const otherIdentity: NativeSession = { ...identity, id: 42, name: 'الحساب الآخر',
  complex: { registrationNumber: 'other-fixture', name: 'جهة أخرى' } };
const otherLogin = { ...login, loginNumber: '0042', registrationNumber: otherIdentity.complex.registrationNumber };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const code = (expected: NativeApiErrorCode) => (cause: unknown) => cause instanceof NativeApiError && cause.code === expected;
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('not started'); };
  let reject: (cause: Error) => void = () => { throw new Error('not started'); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(session: NativeFetch = async () => json(identity), timeoutMs = 15_000) {
  let value: StoredNativeSession | null = null;
  let sessionCalls = 0;
  let protectedCalls = 0;
  let clears = 0;
  const storage: SessionStorage = {
    load: async () => value,
    save: async record => { value = record; },
    clear: async () => { value = null; clears += 1; },
  };
  const api = createNativeApi({ baseUrl, timeoutMs, fetch: async (url, init) => {
    if (url.endsWith('/auth/login')) {
      const input = JSON.parse(String(init.body)) as { loginNumber: string };
      return json(input.loginNumber === otherLogin.loginNumber ? { ...otherIdentity, token: otherToken } : { ...identity, token });
    }
    if (url.endsWith('/auth/logout')) return json({ ok: true });
    if (url.endsWith('/auth/session')) { sessionCalls += 1; return session(url, init); }
    protectedCalls += 1;
    return json({ ok: true });
  } });
  const controller = createNativeSession({ api, storage });
  return { api, storage, controller, stored: () => value,
    counts: () => ({ sessionCalls, protectedCalls, clears }) };
}

test('verified picker preserves the authenticated snapshot and its session reference without republishing', async () => {
  const local = setup(async (url, init) => {
    assert.equal(url, baseUrl + '/auth/session');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(new Headers(init.headers).get('X-Registration-Number'), identity.complex.registrationNumber);
    return json({ ...identity, dashboardPermissions: ['reports', 'store', 'store'] });
  });
  await local.controller.login(login);
  const snapshot = local.controller.getSnapshot();
  const saved = local.stored();
  let publications = 0;
  const unsubscribe = local.controller.subscribe(() => { publications += 1; });
  const result = await withVerifiedNativeExternalActivity(local.controller, async () => {
    assert.equal(nativeExternalActivityPending(local.controller), true);
    assert.equal(local.controller.getSnapshot(), snapshot);
    return 'selected-image';
  });
  unsubscribe();
  assert.equal(result, 'selected-image');
  assert.equal(local.controller.getSnapshot(), snapshot);
  assert.equal(local.controller.getSnapshot().session, snapshot.session);
  assert.equal(local.stored(), saved);
  assert.equal(publications, 0);
  assert.equal(local.counts().sessionCalls, 1);
  assert.equal(nativeExternalActivityPending(local.controller), false);
});

test('cancelled picker still verifies the server before returning null', async () => {
  const local = setup();
  await local.controller.login(login);
  const snapshot = local.controller.getSnapshot();
  assert.equal(await withVerifiedNativeExternalActivity(local.controller, async () => null), null);
  assert.equal(local.counts().sessionCalls, 1);
  assert.equal(local.controller.getSnapshot(), snapshot);
  assert.equal(nativeExternalActivityPending(local.controller), false);
});

test('protected requests remain blocked during the picker and until session verification finishes', async () => {
  const picker = deferred<string>();
  const verification = deferred<Response>();
  const started = deferred<void>();
  const local = setup(async () => { started.resolve(); return verification.promise; });
  await local.controller.login(login);
  const pending = withVerifiedNativeExternalActivity(local.controller, () => picker.promise);
  await assert.rejects(local.controller.request('/private'), code('cancelled'));
  assert.equal(local.counts().protectedCalls, 0);
  assert.equal(local.counts().sessionCalls, 0);
  picker.resolve('image');
  await started.promise;
  assert.equal(nativeExternalActivityPending(local.controller), true);
  await assert.rejects(local.controller.request('/private'), code('cancelled'));
  assert.equal(local.counts().protectedCalls, 0);
  verification.resolve(json(identity));
  assert.equal(await pending, 'image');
  assert.deepEqual(await local.controller.request('/private'), { ok: true });
  assert.equal(local.counts().protectedCalls, 1);
});

test('a nested picker is refused without releasing or verifying the first activity', async () => {
  const picker = deferred<string>();
  const local = setup();
  await local.controller.login(login);
  const first = withVerifiedNativeExternalActivity(local.controller, () => picker.promise);
  let secondWorkRan = false;
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => { secondWorkRan = true; return 'other'; }), code('conflict'));
  assert.equal(secondWorkRan, false);
  assert.equal(local.counts().sessionCalls, 0);
  assert.equal(nativeExternalActivityPending(local.controller), true);
  picker.resolve('first');
  assert.equal(await first, 'first');
  assert.equal(nativeExternalActivityPending(local.controller), false);
});

for (const [label, changed] of [
  ['grants', { ...identity, dashboardPermissions: ['reports'] }],
  ['name', { ...identity, name: 'الاسم الحالي' }],
  ['complex name', { ...identity, complex: { ...identity.complex, name: 'اسم الجهة الحالي' } }],
] as const) {
  test(`changed ${label} publishes the fresh identity and refuses the old picker result`, async () => {
    const local = setup(async () => json(changed));
    await local.controller.login(login);
    const before = local.controller.getSnapshot();
    const saved = local.stored();
    const states: string[] = [];
    const unsubscribe = local.controller.subscribe(() => states.push(local.controller.getSnapshot().status));
    await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => 'old-image'), code('cancelled'));
    unsubscribe();
    const after = local.controller.getSnapshot();
    assert.equal(after.status, 'authenticated');
    assert.notEqual(after, before);
    assert.deepEqual(after.session, changed);
    assert.equal(local.stored(), saved);
    assert.deepEqual(states, ['authenticated']);
    assert.equal(nativeExternalActivityPending(local.controller), false);
  });
}

for (const [label, changed] of [
  ['account', { ...identity, id: 42 }],
  ['role', { ...identity, role: 'manager' }],
  ['tenant', { ...identity, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }],
  ['malformed grants', { ...identity, dashboardPermissions: 'store' }],
] as const) {
  test(`picker verification rejects a different ${label} and clears the credential`, async () => {
    const local = setup(async () => json(changed));
    await local.controller.login(login);
    await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => 'image'), code('invalid-response'));
    assert.equal(local.controller.getSnapshot().status, 'error');
    assert.equal(local.controller.getSnapshot().session, null);
    assert.equal(local.stored(), null);
    assert.equal(nativeExternalActivityPending(local.controller), false);
    await assert.rejects(local.controller.request('/private'), code('unauthorized'));
    assert.equal(local.counts().protectedCalls, 0);
  });
}

for (const [status, failure] of [[401, 'unauthorized'], [403, 'forbidden']] as const) {
  test(`picker session ${status} fails closed and releases its lease`, async () => {
    const local = setup(async () => json({ privateMessage: 'hidden' }, status));
    await local.controller.login(login);
    await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => 'image'), code(failure));
    assert.equal(local.controller.getSnapshot().status, 'error');
    assert.equal(local.controller.getSnapshot().session, null);
    assert.equal(local.stored(), null);
    assert.equal(nativeExternalActivityPending(local.controller), false);
    await assert.rejects(local.controller.request('/private'), code('unauthorized'));
    assert.equal(local.counts().protectedCalls, 0);
  });
}

test('network failure retains only the private credential and removes authenticated access', async () => {
  const local = setup(async () => { throw new Error('private network detail'); });
  await local.controller.login(login);
  const saved = local.stored();
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => 'image'), cause =>
    code('network')(cause) && !(cause as Error).message.includes('private'));
  assert.equal(local.controller.getSnapshot().status, 'offline');
  assert.equal(local.controller.getSnapshot().session, null);
  assert.equal(local.stored(), saved);
  assert.equal(nativeExternalActivityPending(local.controller), false);
  await assert.rejects(local.controller.request('/private'), code('unauthorized'));
  assert.equal(local.counts().protectedCalls, 0);
});

test('session verification timeout removes authenticated access and releases the activity', async () => {
  const local = setup(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), 20);
  await local.controller.login(login);
  const saved = local.stored();
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => 'image'), code('timeout'));
  assert.equal(local.controller.getSnapshot().status, 'offline');
  assert.equal(local.controller.getSnapshot().session, null);
  assert.equal(local.stored(), saved);
  assert.equal(nativeExternalActivityPending(local.controller), false);
});

test('work failure verifies the session, returns the original failure and permits a later picker', async () => {
  const local = setup();
  await local.controller.login(login);
  const before = local.controller.getSnapshot();
  const failure = new Error('invalid image');
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => { throw failure; }), cause => cause === failure);
  assert.equal(local.counts().sessionCalls, 1);
  assert.equal(local.controller.getSnapshot(), before);
  assert.equal(nativeExternalActivityPending(local.controller), false);
  assert.equal(await withVerifiedNativeExternalActivity(local.controller, async () => 'valid-image'), 'valid-image');
  assert.equal(local.counts().sessionCalls, 2);
});

test('invalid authentication takes priority over a picker failure', async () => {
  const local = setup(async () => json({}, 401));
  await local.controller.login(login);
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, async () => { throw new Error('invalid image'); }), code('unauthorized'));
  assert.equal(local.controller.getSnapshot().session, null);
  assert.equal(local.stored(), null);
  assert.equal(nativeExternalActivityPending(local.controller), false);
});

for (const action of ['logout', 'login', 'cancel'] as const) {
  test(`${action} during the picker prevents a late result from authorizing or changing the current session`, async () => {
    const picker = deferred<string>();
    const local = setup();
    await local.controller.login(login);
    const pending = withVerifiedNativeExternalActivity(local.controller, () => picker.promise);
    const rejected = assert.rejects(pending, code('cancelled'));
    if (action === 'logout') await local.controller.logout();
    else if (action === 'login') await local.controller.login(otherLogin);
    else local.controller.cancel();
    const afterAction = local.controller.getSnapshot();
    const saved = local.stored();
    picker.resolve('old-image');
    await rejected;
    assert.equal(local.controller.getSnapshot(), afterAction);
    assert.equal(local.stored(), saved);
    assert.equal(local.counts().sessionCalls, 0);
    assert.equal(nativeExternalActivityPending(local.controller), false);
    if (action === 'logout') assert.equal(afterAction.status, 'signed-out');
    if (action === 'login') assert.equal(afterAction.session?.id, otherIdentity.id);
  });
}

for (const action of ['logout', 'login', 'cancel'] as const) {
  for (const status of [200, 401]) {
    test(`${action} during session verification ignores the late ${status} response`, async () => {
      const verification = deferred<Response>();
      const started = deferred<void>();
      const local = setup(async () => { started.resolve(); return verification.promise; });
      await local.controller.login(login);
      const pending = withVerifiedNativeExternalActivity(local.controller, async () => 'old-image');
      const rejected = assert.rejects(pending, code('cancelled'));
      await started.promise;
      if (action === 'logout') await local.controller.logout();
      else if (action === 'login') await local.controller.login(otherLogin);
      else local.controller.cancel();
      const afterAction = local.controller.getSnapshot();
      const saved = local.stored();
      verification.resolve(json(status === 200 ? identity : {}, status));
      await rejected;
      assert.equal(local.controller.getSnapshot(), afterAction);
      assert.equal(local.stored(), saved);
      assert.equal(nativeExternalActivityPending(local.controller), false);
      if (action === 'logout') assert.equal(afterAction.status, 'signed-out');
      if (action === 'login') assert.equal(afterAction.session?.id, otherIdentity.id);
    });
  }
}

test('an activity cannot start signed out or on an unregistered controller copy', async () => {
  const local = setup();
  let workRan = false;
  const work = async () => { workRan = true; return 'image'; };
  await assert.rejects(withVerifiedNativeExternalActivity(local.controller, work), code('unauthorized'));
  await local.controller.login(login);
  await assert.rejects(withVerifiedNativeExternalActivity({ ...local.controller }, work), code('configuration'));
  assert.equal(workRan, false);
  assert.equal(nativeExternalActivityPending(local.controller), false);
  assert.equal(local.counts().sessionCalls, 0);
});

for (const action of ['login', 'cancel'] as const) {
  test(`${action} releases the old lease and its late finally cannot release a newer activity`, async () => {
    const oldPicker = deferred<string>();
    const newPicker = deferred<string>();
    const local = setup(async (_url, init) => json(new Headers(init.headers).get('Authorization') === `Bearer ${otherToken}`
      ? otherIdentity : identity));
    await local.controller.login(login);
    const old = withVerifiedNativeExternalActivity(local.controller, () => oldPicker.promise);
    const rejected = assert.rejects(old, code('cancelled'));
    if (action === 'login') await local.controller.login(otherLogin);
    else local.controller.cancel();
    const current = local.controller.getSnapshot();
    assert.equal(nativeExternalActivityPending(local.controller), false);
    assert.deepEqual(await local.controller.request('/private'), { ok: true });
    const next = withVerifiedNativeExternalActivity(local.controller, () => newPicker.promise);
    assert.equal(nativeExternalActivityPending(local.controller), true);
    oldPicker.resolve('stale-image');
    await rejected;
    assert.equal(local.controller.getSnapshot(), current);
    assert.equal(nativeExternalActivityPending(local.controller), true);
    await assert.rejects(local.controller.request('/private'), code('cancelled'));
    assert.equal(local.counts().sessionCalls, 0);
    newPicker.resolve('current-image');
    assert.equal(await next, 'current-image');
    assert.equal(local.counts().sessionCalls, 1);
    assert.equal(local.controller.getSnapshot(), current);
    assert.equal(nativeExternalActivityPending(local.controller), false);
  });
}
