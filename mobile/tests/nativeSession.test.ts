import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSession, parseStoredNativeSession, type NativeRole, type NativeSession,
  type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeApiErrorCode, type NativeFetch } from '../src/services/nativeApi';
import { createSessionStorage as createWebStorage } from '../src/services/sessionStorage.web';

const baseUrl = 'https://example.invalid/api';
const token = 'a'.repeat(64);
const nextToken = 'b'.repeat(64);
const identity: NativeSession = { role: 'manager', id: 7, name: 'حساب مصطنع', dashboardPermissions: ['students'],
  complex: { registrationNumber: 'native-fixture', name: 'جهة اختبار' } };
const stored: StoredNativeSession = { version: 1, apiBase: baseUrl, registrationNumber: 'native-fixture',
  token, id: identity.id, role: identity.role };
const login = { loginNumber: '0017', password: '', registrationNumber: 'native-fixture' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const code = (expected: NativeApiErrorCode) => (error: unknown) => error instanceof NativeApiError && error.code === expected;
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('not started'); };
  let reject: (error: Error) => void = () => { throw new Error('not started'); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function memory(initial: StoredNativeSession | null = null) {
  let value = initial;
  const storage: SessionStorage = { load: async () => value, save: async next => { value = next; }, clear: async () => { value = null; } };
  return { storage, value: () => value };
}
function setup(fetch: NativeFetch = async url => json(url.endsWith('/auth/logout') ? { ok: true } : { ...identity, token }),
  initial: StoredNativeSession | null = null) {
  const local = memory(initial);
  const api = createNativeApi({ baseUrl, fetch });
  return { ...local, controller: createNativeSession({ api, storage: local.storage }) };
}

for (const role of ['manager', 'student', 'supervisor', 'admin'] as NativeRole[]) {
  test(`native API controller accepts ${role} and persists only the minimal credential`, async () => {
    const { controller, value } = setup(async () => json({ ...identity, role, dashboardPermissions: [], token }));
    await controller.login(login, { expectedRole: role });
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'authenticated'); assert.equal(snapshot.session?.role, role);
    assert.deepEqual(snapshot.session?.dashboardPermissions, []);
    assert.equal('token' in (snapshot.session ?? {}), false);
    assert.deepEqual(Object.keys(value() ?? {}).sort(), ['apiBase', 'id', 'registrationNumber', 'role', 'token', 'version']);
  });
}

test('wrong password and retired roles never become authenticated', async () => {
  for (const response of [json({ message: 'raw failure' }, 401), json({ ...identity, role: 'reciter', token })]) {
    const { controller, value } = setup(async () => response);
    await assert.rejects(controller.login(login), error => code('unauthorized')(error) || code('invalid-response')(error));
    assert.equal(controller.getSnapshot().session, null); assert.equal(value(), null);
  }
});

test('a valid login for the wrong expected role is revoked and rejected', async () => {
  let logout = false;
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) { logout = true; assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`); return json({ ok: true }); }
    return json({ ...identity, token });
  });
  await assert.rejects(controller.login(login, { expectedRole: 'student' }), code('forbidden'));
  assert.equal(logout, true); assert.equal(value(), null); assert.equal(controller.getSnapshot().session, null);
});

test('a server response for another requested tenant is rejected and not persisted', async () => {
  const { controller, value } = setup(async url => url.endsWith('/auth/logout') ? json({ ok: true })
    : json({ ...identity, token, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }));
  await assert.rejects(controller.login(login), code('invalid-response'));
  assert.equal(value(), null);
});

test('a fresh controller restores identity and current grants from the actual session endpoint', async () => {
  let sessionCalls = 0;
  const { controller } = setup(async url => {
    assert.equal(url, baseUrl + '/auth/session'); sessionCalls += 1;
    return json({ ...identity, name: 'الاسم الحالي', dashboardPermissions: [] });
  }, stored);
  assert.equal(controller.getSnapshot().session, null);
  await controller.restore();
  assert.equal(sessionCalls, 1); assert.equal(controller.getSnapshot().session?.name, 'الاسم الحالي');
  assert.deepEqual(controller.getSnapshot().session?.dashboardPermissions, []);
});

test('restore 401 clears a revoked session; offline retains it without granting dashboard access', async () => {
  const revoked = setup(async () => json({}, 401), stored);
  await assert.rejects(revoked.controller.restore(), code('unauthorized'));
  assert.equal(revoked.value(), null); assert.equal(revoked.controller.getSnapshot().session, null);
  const offline = setup(async () => { throw new Error('private network'); }, stored);
  await assert.rejects(offline.controller.restore(), code('network'));
  assert.deepEqual(offline.value(), stored); assert.equal(offline.controller.getSnapshot().status, 'offline');
  assert.equal(offline.controller.getSnapshot().session, null);
  await assert.rejects(offline.controller.request('/students'), code('unauthorized'));
  const result = await offline.controller.logout();
  assert.equal(result.localCleared, true); assert.equal(result.serverRevoked, false);
  assert.equal(result.error?.code, 'network'); assert.equal(offline.value(), null);
});

test('stored account, role and tenant cannot authorize a different server identity', async () => {
  for (const wrong of [{ ...identity, id: 8 }, { ...identity, role: 'admin' },
    { ...identity, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }]) {
    const { controller, value } = setup(async () => json(wrong), stored);
    await assert.rejects(controller.restore(), code('invalid-response'));
    assert.equal(controller.getSnapshot().session, null); assert.equal(value(), null);
  }
});

test('stored credentials from a different API base are cleared without sending them there', async () => {
  let calls = 0;
  const { controller, value } = setup(async () => { calls += 1; return json(identity); }, { ...stored, apiBase: 'https://other.invalid/api' });
  await controller.restore(); assert.equal(calls, 0); assert.equal(value(), null);
  assert.equal(controller.getSnapshot().status, 'signed-out');
});

test('missing or corrupted secure credential is rejected without a protected request', async () => {
  assert.throws(() => parseStoredNativeSession({ ...stored, token: '' }), code('storage'));
  assert.throws(() => parseStoredNativeSession({ ...stored, role: 'reciter' }), code('storage'));
  const { controller } = setup(undefined, null); await controller.restore();
  assert.equal(controller.getSnapshot().status, 'signed-out');
});

test('web session storage never persists credentials across instances or grants from local data', async () => {
  const first = createWebStorage(); await first.save(stored);
  assert.deepEqual(await first.load(), stored);
  assert.equal(await createWebStorage().load(), null);
  await first.clear(); assert.equal(await first.load(), null);
});

test('logout clears local auth immediately and revokes the captured server credential', async () => {
  const gate = deferred<Response>();
  const started = deferred<void>();
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) {
      assert.equal(new Headers(init.headers).get('X-Registration-Number'), 'native-fixture');
      assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
      started.resolve(); return gate.promise;
    }
    return json({ ...identity, token });
  });
  await controller.login(login);
  const pending = controller.logout();
  assert.equal(controller.getSnapshot().status, 'signed-out');
  await started.promise; assert.equal(value(), null);
  gate.resolve(json({ ok: true }));
  assert.deepEqual(await pending, { localCleared: true, serverRevoked: true, error: null });
});

test('logout 401 is already revoked; offline logout reports unconfirmed revocation after local clear', async () => {
  for (const offline of [false, true]) {
    const { controller, value } = setup(async url => {
      if (url.endsWith('/auth/logout')) { if (offline) throw new Error('raw offline'); return json({}, 401); }
      return json({ ...identity, token });
    });
    await controller.login(login); const result = await controller.logout();
    assert.equal(result.localCleared, true); assert.equal(result.serverRevoked, !offline);
    assert.equal(value(), null); assert.equal(controller.getSnapshot().session, null);
  }
});

test('a stale login cannot authenticate after cancellation or overwrite a newer login', async () => {
  const old = deferred<Response>(); const started = deferred<void>();
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) return json({ ok: true });
    const body = JSON.parse(String(init.body));
    if (body.loginNumber === '0017') { started.resolve(); return old.promise; }
    return json({ ...identity, id: 8, token: nextToken, name: 'الحساب الجديد' });
  });
  const first = controller.login(login); const cancelled = assert.rejects(first, code('cancelled'));
  await started.promise;
  await controller.login({ ...login, loginNumber: '0018' });
  old.resolve(json({ ...identity, token })); await cancelled;
  assert.equal(controller.getSnapshot().session?.id, 8); assert.equal(value()?.token, nextToken);
});

test('a stale 401 cannot clear a new account or a new tenant session', async () => {
  const old = deferred<Response>(); const started = deferred<void>(); let account = 7;
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/private')) { started.resolve(); return old.promise; }
    account = JSON.parse(String(init.body)).loginNumber === '0017' ? 7 : 8;
    return json({ ...identity, id: account, token: account === 7 ? token : nextToken,
      complex: { ...identity.complex, registrationNumber: account === 7 ? 'native-fixture' : 'other-fixture' } });
  });
  await controller.login(login);
  const first = controller.request('/private'); const cancelled = assert.rejects(first, code('cancelled'));
  await started.promise;
  await controller.login({ ...login, loginNumber: '0018', registrationNumber: 'other-fixture' });
  old.resolve(json({}, 401)); await cancelled;
  assert.equal(controller.getSnapshot().session?.id, 8);
  assert.equal(value()?.registrationNumber, 'other-fixture');
});

test('a late restore cannot replace the currently signed-in identity', async () => {
  const old = deferred<Response>(); const started = deferred<void>();
  const { controller, value } = setup(async url => {
    if (url.endsWith('/auth/session')) { started.resolve(); return old.promise; }
    return json({ ...identity, id: 8, token: nextToken });
  }, stored);
  const restore = controller.restore(); const cancelled = assert.rejects(restore, code('cancelled'));
  await started.promise;
  await controller.login({ ...login, loginNumber: '0018' });
  old.resolve(json(identity)); await cancelled;
  assert.equal(controller.getSnapshot().session?.id, 8); assert.equal(value()?.id, 8);
});

test('logout waits for a pending secure save then clears it instead of resurrecting the session', async () => {
  const gate = deferred<void>(); const started = deferred<void>(); const local = memory();
  const storage: SessionStorage = { ...local.storage, save: async value => { started.resolve(); await gate.promise; await local.storage.save(value); } };
  const api = createNativeApi({ baseUrl, fetch: async url => json(url.endsWith('/auth/logout') ? { ok: true } : { ...identity, token }) });
  const controller = createNativeSession({ api, storage });
  const signIn = controller.login(login); const cancelled = assert.rejects(signIn, code('cancelled'));
  await started.promise; const logout = controller.logout(); gate.resolve();
  await cancelled; await logout;
  assert.equal(local.value(), null); assert.equal(controller.getSnapshot().session, null);
});

test('new login waits for old logout and the old response cannot remove new credentials', async () => {
  const gate = deferred<Response>(); const started = deferred<void>();
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) { started.resolve(); return gate.promise; }
    const second = JSON.parse(String(init.body)).loginNumber === '0018';
    return json({ ...identity, id: second ? 8 : 7, token: second ? nextToken : token });
  });
  await controller.login(login); const logout = controller.logout(); await started.promise;
  const signIn = controller.login({ ...login, loginNumber: '0018' });
  gate.resolve(json({ ok: true })); await logout; await signIn;
  assert.equal(controller.getSnapshot().session?.id, 8); assert.equal(value()?.token, nextToken);
});

test('secure save failure never authenticates and attempts revoke without exposing the storage error', async () => {
  let revoked = false;
  const api = createNativeApi({ baseUrl, fetch: async url => {
    if (url.endsWith('/auth/logout')) { revoked = true; return json({ ok: true }); }
    return json({ ...identity, token });
  } });
  const storage: SessionStorage = { load: async () => null, save: async () => { throw new Error('secret secure store detail'); }, clear: async () => undefined };
  const controller = createNativeSession({ api, storage });
  await assert.rejects(controller.login(login), error => code('storage')(error) && !(error as Error).message.includes('secret'));
  assert.equal(revoked, true); assert.equal(controller.getSnapshot().session, null);
});

test('protected 403 retains auth but 401 removes local authorization and persistence', async () => {
  let status = 403;
  const { controller, value } = setup(async url => url.endsWith('/private') ? json({}, status) : json({ ...identity, token }));
  await controller.login(login);
  await assert.rejects(controller.request('/private'), code('forbidden'));
  assert.equal(controller.getSnapshot().status, 'authenticated');
  status = 401;
  await assert.rejects(controller.request('/private'), code('unauthorized'));
  assert.equal(controller.getSnapshot().session, null); assert.equal(value(), null);
});

test('cancel aborts a pending login and subscriber cannot see an authenticated snapshot', async () => {
  const gate = deferred<Response>(); const started = deferred<void>();
  const { controller } = setup(async url => {
    if (url.endsWith('/auth/logout')) return json({ ok: true });
    started.resolve(); return gate.promise;
  });
  const states: string[] = []; const unsubscribe = controller.subscribe(() => states.push(controller.getSnapshot().status));
  const pending = controller.login(login); const cancelled = assert.rejects(pending, code('cancelled'));
  await started.promise; controller.cancel(); gate.resolve(json({ ...identity, token })); await cancelled; unsubscribe();
  assert.equal(states.includes('authenticated'), false); assert.equal(controller.getSnapshot().status, 'signed-out');
});

test('a late issued login is revoked in its old context without clearing the newer account', async () => {
  const gate = deferred<Response>(); const started = deferred<void>();
  const revoked: string[] = [];
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) {
      revoked.push(new Headers(init.headers).get('Authorization') ?? '');
      assert.equal(new Headers(init.headers).get('X-Registration-Number'), 'native-fixture');
      return json({ ok: true });
    }
    if (JSON.parse(String(init.body)).loginNumber === '0017') { started.resolve(); return gate.promise; }
    return json({ ...identity, id: 8, token: nextToken });
  });
  const old = controller.login(login); const cancelled = assert.rejects(old, code('cancelled'));
  await started.promise; await controller.login({ ...login, loginNumber: '0018' });
  gate.resolve(json({ ...identity, token })); await cancelled;
  assert.deepEqual(revoked, [`Bearer ${token}`]);
  assert.equal(value()?.token, nextToken); assert.equal(controller.getSnapshot().session?.id, 8);
});

test('logout during restore revokes the secure credential while ignoring the late identity', async () => {
  const gate = deferred<Response>(); const started = deferred<void>(); let revoked = false;
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/session')) { started.resolve(); return gate.promise; }
    assert.equal(url.endsWith('/auth/logout'), true);
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    revoked = true; return json({ ok: true });
  }, stored);
  const restore = controller.restore(); const cancelled = assert.rejects(restore, code('cancelled'));
  await started.promise; const result = await controller.logout();
  gate.resolve(json(identity)); await cancelled;
  assert.equal(revoked, true); assert.equal(result.serverRevoked, true);
  assert.equal(value(), null); assert.equal(controller.getSnapshot().status, 'signed-out');
});

test('logout again during a login waiting for an older revoke cancels the waiting login', async () => {
  const gate = deferred<Response>(); const started = deferred<void>(); let secondLogin = false;
  const { controller, value } = setup(async (url, init) => {
    if (url.endsWith('/auth/logout')) { started.resolve(); return gate.promise; }
    if (JSON.parse(String(init.body)).loginNumber === '0018') secondLogin = true;
    return json({ ...identity, token });
  });
  await controller.login(login); const logout = controller.logout(); await started.promise;
  const next = controller.login({ ...login, loginNumber: '0018' });
  const cancelled = assert.rejects(next, code('cancelled'));
  const repeated = controller.logout(); gate.resolve(json({ ok: true }));
  await logout; await repeated; await cancelled;
  assert.equal(secondLogin, false); assert.equal(value(), null); assert.equal(controller.getSnapshot().status, 'signed-out');
});
