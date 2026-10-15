import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeApi, NativeApiError, normalizeNativeApiBase, normalizeRegistrationNumber,
  type NativeApiErrorCode, type NativeFetch } from '../src/services/nativeApi';

// These are generated-shape synthetic credentials, never a connected account.
const token = 'a'.repeat(64);
const identity = { role: 'manager', id: 7, name: 'حساب اختبار', dashboardPermissions: ['students'],
  complex: { registrationNumber: 'native-fixture', name: 'جهة اختبار' } };
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
const code = (expected: NativeApiErrorCode) => (error: unknown) => error instanceof NativeApiError && error.code === expected;

test('API base is explicit, normalized and rejects unsafe remote transports or URL credentials', () => {
  assert.equal(normalizeNativeApiBase(' https://example.invalid/api/// '), 'https://example.invalid/api');
  assert.equal(normalizeNativeApiBase('http://10.0.2.2:8133/api'), 'http://10.0.2.2:8133/api');
  for (const value of [undefined, '', '/api', 'http://example.invalid/api', 'https://u:p@example.invalid/api',
    'https://example.invalid/api?q=1', 'https://example.invalid/api#x', 'file:///api']) {
    assert.throws(() => normalizeNativeApiBase(value), code('configuration'));
  }
});

test('opaque tenant keys reuse the shared registration contract and never become URLs', () => {
  for (const value of ['native-fixture', 'tenant_A-2', '0012', 'Z']) assert.equal(normalizeRegistrationNumber(value), value);
  assert.equal(normalizeRegistrationNumber(undefined), '');
  assert.equal(normalizeRegistrationNumber(''), '');
  for (const value of ['https://example.invalid', '../other', 'a/b', 'a?b', 'a\r\nb', 'a'.repeat(33), {}, null]) {
    assert.throws(() => normalizeRegistrationNumber(value), code('validation'));
  }
});

test('public registration uses only explicit tenant context, with no bearer or cookies', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const api = createNativeApi({ baseUrl: 'http://127.0.0.1:8133/api', fetch: async (url, init) => {
    calls.push({ url, init }); return json({ ok: true });
  } });
  await api.request('/registration/public?registrationNumber=native-fixture', { registrationNumber: 'native-fixture' });
  await api.request('/registration/public', { method: 'POST', registrationNumber: 'native-fixture',
    body: { name: 'طلب مصطنع', registrationNumber: 'native-fixture' } });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.init.credentials, 'omit');
    assert.equal(call.init.redirect, 'error');
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('X-Nukhab-Native'), '1');
    assert.equal(headers.get('X-Registration-Number'), 'native-fixture');
    assert.equal(headers.has('Authorization'), false);
  }
});

test('native login preserves the password, receives a bearer and trusts server identity', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)), { loginNumber: '0017', password: '  exact password  ' });
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    return json({ ...identity, token, apiBase: 'https://untrusted.invalid/api' });
  } });
  const result = await api.login({ loginNumber: ' 0017 ', password: '  exact password  ', registrationNumber: 'native-fixture' });
  assert.equal(result.token, token);
  assert.equal(result.role, 'manager');
  assert.equal(api.baseUrl, 'https://example.invalid/api');
  assert.equal('apiBase' in result, false, 'Server payload cannot redirect future credentials');
  assert.ok(Object.isFrozen(result.dashboardPermissions));
});

test('empty passwords are submitted unchanged for server-side legacy account handling', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (_url, init) => {
    assert.equal(JSON.parse(String(init.body)).password, ''); return json({ ...identity, token });
  } });
  await api.login({ loginNumber: '0017', password: '' });
});

for (const role of ['manager', 'student', 'supervisor', 'admin']) {
  test(`server ${role} identity is accepted without adding client grants`, async () => {
    const body = { ...identity, role, dashboardPermissions: [] as string[], token };
    const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => json(body) });
    const result = await api.login({ loginNumber: '0017', password: '' });
    assert.equal(result.role, role);
    assert.deepEqual(result.dashboardPermissions, []);
  });
}

test('unsupported roles, missing bearer and malformed identity are rejected', async () => {
  for (const body of [{ ...identity, token: undefined }, { ...identity, token: 'not-a-token' },
    { ...identity, token, role: 'reciter' }, { ...identity, token, id: null },
    { ...identity, token, dashboardPermissions: 'all' },
    { ...identity, token, complex: { name: 'جهة', registrationNumber: '../other' } }]) {
    const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => json(body) });
    await assert.rejects(api.login({ loginNumber: '0017', password: '' }), code('invalid-response'));
  }
});

test('session restoration calls the actual endpoint with exact bearer and tenant, omitting token from result', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, init) => {
    assert.equal(url, 'https://example.invalid/api/auth/session');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(new Headers(init.headers).get('X-Registration-Number'), 'native-fixture');
    return json({ ...identity, token });
  } });
  const result = await api.session({ token, registrationNumber: 'native-fixture' });
  assert.equal('token' in result, false);
  assert.equal(result.id, identity.id);
});

test('missing or invalid bearer is rejected before protected transport', async () => {
  let called = false;
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => { called = true; return json(identity); } });
  await assert.rejects(api.session({ token: '', registrationNumber: 'native-fixture' }), code('unauthorized'));
  assert.equal(called, false);
});

for (const [status, expected] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not-found'],
  [409, 'conflict'], [413, 'validation'], [422, 'validation'], [429, 'rate-limited'], [503, 'server']] as const) {
  test(`HTTP ${status} is safe and distinct from an offline failure`, async () => {
    const raw = 'private SQL password=do-not-emit';
    const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => json({ message: raw }, status,
      status === 429 ? { 'Retry-After': '30' } : undefined) });
    await assert.rejects(api.request('/private'), error => {
      assert.ok(error instanceof NativeApiError);
      assert.equal(error.code, expected); assert.equal(error.status, status);
      assert.equal(error.message.includes(raw), false);
      if (status === 429) assert.equal(error.retryAfterMs, 30_000);
      return true;
    });
  });
}

test('network and malformed JSON errors do not expose transport details', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => { throw new Error('Authorization: private'); } });
  await assert.rejects(api.request('/private'), error => code('network')(error) && !(error as Error).message.includes('private'));
  const malformed = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => new Response('not json') });
  await assert.rejects(malformed.request('/private'), code('invalid-response'));
});

test('paths cannot escape the configured API namespace or become external URLs', async () => {
  let calls = 0;
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => { calls += 1; return json({}); } });
  for (const path of ['https://other.invalid', '//other.invalid', '/../outside', '/%2e%2e/outside', '/auth\\login', '/auth#fragment']) {
    await assert.rejects(api.request(path), code('validation'));
  }
  assert.equal(calls, 0);
});

test('caller cancellation rejects a late response even if the transport ignores abort', async () => {
  let complete: (response: Response) => void = () => { throw new Error('not started'); };
  const fetcher: NativeFetch = async () => new Promise(resolve => { complete = resolve; });
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: fetcher });
  const abort = new AbortController();
  const pending = api.request('/private', { signal: abort.signal });
  const rejected = assert.rejects(pending, code('cancelled'));
  abort.abort(); complete(json({ ok: true })); await rejected;
});

test('timeout is bounded and distinguishable from cancellation and network failure', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', timeoutMs: 5, fetch: async (_url, init) =>
    new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('private timeout')), { once: true })) });
  await assert.rejects(api.request('/private'), code('timeout'));
});

test('logout posts only the captured credential and verifies the revoke acknowledgement', async () => {
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, init) => {
    assert.equal(url.endsWith('/auth/logout'), true); assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(String(init.body), '{}'); return json({ ok: true });
  } });
  await api.logout({ token, registrationNumber: 'native-fixture' });
});

test('login 401 and 404 report wrong credentials while restore 401 reports an expired session', async () => {
  for (const status of [401, 404]) {
    const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => json({ message: 'unsafe detail' }, status) });
    await assert.rejects(api.login({ loginNumber: '0017', password: 'wrong' }), error => {
      assert.ok(error instanceof NativeApiError);
      assert.equal(error.message, 'رقم الدخول أو كلمة المرور غير صحيحة.');
      return true;
    });
  }
  const api = createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async () => json({}, 401) });
  await assert.rejects(api.session({ token, registrationNumber: 'native-fixture' }), error => {
    assert.ok(error instanceof NativeApiError); assert.match(error.message, /انتهت جلسة/); return true;
  });
});
