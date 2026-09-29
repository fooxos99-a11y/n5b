import { createRequestCooldown } from '../src/lib/requestCooldown.js';
import { isDeferredMutation, isDashboardUndoActive, deferredActions } from '../src/lib/deferredActions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { prepareTimedRequest, requestTimeoutMessage } from '../src/lib/requestTimeout.js';
import { singleFlight, refreshableSingleFlight } from '../src/lib/asyncRequests.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
test('logout immediately replaces the account route with the login page', async () => {
  const pending = deferred();
  const navigations = [];
  const { useAccountLogout } = await loadModule('../src/hooks/useAccountLogout.js', {
    useNavigate: () => (...args) => navigations.push(args),
    useToast: () => ({ toast: () => {} }),
    studentsApi: { logout: () => pending.promise },
  }, ['useAccountLogout']);
  useAccountLogout()();
  assert.equal(navigations[0][0], '/login');
  assert.equal(navigations[0][1].replace, true);
  pending.resolve();
});
async function loadModule(file, bindings, exports) {
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/\bexport /g, '');
  return vm.runInNewContext(`${source}\n({${exports.join(',')}})`, bindings);
}
async function setupApi() {
  const localStorage = storage();
  localStorage.setItem('wajeh_role', 'student');
  localStorage.setItem('nukhab_web_session', '1');
  const requests = [];
  let version = 0;
  let tenant = 'old-tenant';
  const api = await loadModule('../src/services/studentsApi.js', {
    Capacitor: { isNativePlatform: () => false }, localStorage,
    getBearerToken: async () => '', getAuthSessionVersion: () => version,
    clearAuthSession: async () => { version += 1; localStorage.removeItem('nukhab_web_session'); },
    getTenantRegistrationNumber: () => tenant,
    clearTenantRegistrationNumber: () => { tenant = ''; },
    setTenantRegistrationNumber: (value) => { tenant = value; },
    clearTenantApiBase: () => {}, setTenantApiBase: () => {},
    getApiBase: () => '/old-api', apiBase: '/api',
    prepareTimedRequest, requestTimeoutMessage, singleFlight, refreshableSingleFlight, createRequestCooldown,
    isDeferredMutation, isDashboardUndoActive, deferredActions,
    fetch: (url, options) => {
      const response = deferred();
      requests.push({ url, options, response });
      return response.promise;
    },
  }, ['request', 'studentsApi']);
  const respond = (index, status = 200, body = { ok: true }) => requests[index].response.resolve({
    status, ok: status < 400, json: async () => body,
  });
  const waitRequest = async (count) => {
    for (let index = 0; requests.length < count && index < 20; index += 1) await new Promise(setImmediate);
    assert.equal(requests.length, count);
  };
  return { ...api, localStorage, requests, respond, waitRequest };
}

test('logout clears local access immediately and preserves the original tenant for revocation', async () => {
  const env = await setupApi();
  const completion = env.studentsApi.logout();
  assert.equal(env.localStorage.getItem('wajeh_role'), null);
  assert.equal(env.localStorage.getItem('nukhab_web_session'), null);
  assert.equal(env.studentsApi.logout(), completion, 'Concurrent clicks share one logout');
  await env.waitRequest(1);
  assert.equal(env.requests[0].url, '/old-api/auth/logout');
  assert.equal(env.requests[0].options.headers['X-Registration-Number'], 'old-tenant');
  assert.equal(env.requests[0].options.keepalive, true);
  env.respond(0);
  await completion;
});

test('new login waits for the old logout response so its cookie cannot be cleared late', async () => {
  const env = await setupApi();
  const completion = env.studentsApi.logout();
  const login = env.studentsApi.login({ loginNumber: '123' });
  await env.waitRequest(1);
  env.respond(0);
  await completion;
  await env.waitRequest(2);
  assert.equal(env.requests[1].url, '/api/auth/login');
  env.respond(1, 200, { complex: { registrationNumber: 'new-tenant' } });
  await login;
});

test('a delayed unauthorized request from the old session cannot remove a new session', async () => {
  const env = await setupApi();
  const oldRequest = env.request('/profile');
  await env.waitRequest(1);
  const logout = env.studentsApi.logout();
  await env.waitRequest(2);
  env.respond(1);
  await logout;
  env.localStorage.setItem('wajeh_role', 'student');
  env.localStorage.setItem('nukhab_web_session', 'new-session');
  env.respond(0, 401, { message: 'old session' });
  await assert.rejects(oldRequest, /old session/);
  assert.equal(env.requests.length, 2, 'Never retry using a different session');
  assert.equal(env.localStorage.getItem('nukhab_web_session'), 'new-session');
});

test('a failed logout request remains observable while local access stays cleared', async () => {
  const env = await setupApi();
  const logout = env.studentsApi.logout();
  await env.waitRequest(1);
  env.requests[0].response.reject(new Error('offline'));
  await assert.rejects(logout, /offline/);
  assert.equal(env.localStorage.getItem('wajeh_role'), null);
  assert.equal(env.localStorage.getItem('nukhab_web_session'), null);
});

test('native logout captures the old token without restoring local access or caching it again', async () => {
  const localStorage = storage();
  localStorage.setItem('nukhab_native_session', '1');
  const tokenRead = deferred();
  let removed = false;
  const auth = await loadModule('../src/lib/authSession.js', {
    Capacitor: { isNativePlatform: () => true }, localStorage,
    getSiteConfig: () => ({ secureStoragePrefix: 'test' }),
    KeychainAccess: { afterFirstUnlockThisDeviceOnly: 'test' },
    SecureStorage: {
      setKeyPrefix: async () => {}, setDefaultKeychainAccess: async () => {},
      get: () => tokenRead.promise, remove: async () => { removed = true; },
    },
  }, ['getBearerToken', 'clearAuthSession', 'getAuthSessionMarker']);
  const token = auth.getBearerToken();
  const cleanup = auth.clearAuthSession({ afterTokenRead: token });
  assert.equal(auth.getAuthSessionMarker(), '');
  assert.equal(removed, false);
  tokenRead.resolve('old-native-token');
  assert.equal(await token, 'old-native-token');
  await cleanup;
  assert.equal(removed, true);
  assert.equal(await auth.getBearerToken(), '');
});

test('native logout preserves a legacy token long enough to revoke it during migration', async () => {
  const localStorage = storage();
  localStorage.setItem('wajeh_token', 'legacy-token');
  const ready = deferred();
  const stored = new Map();
  const auth = await loadModule('../src/lib/authSession.js', {
    Capacitor: { isNativePlatform: () => true }, localStorage,
    getSiteConfig: () => ({ secureStoragePrefix: 'test' }),
    KeychainAccess: { afterFirstUnlockThisDeviceOnly: 'test' },
    SecureStorage: {
      setKeyPrefix: () => ready.promise, setDefaultKeychainAccess: async () => {},
      set: async (key, value) => stored.set(key, value),
      get: async (key) => stored.get(key), remove: async (key) => stored.delete(key),
    },
  }, ['getBearerToken', 'clearAuthSession']);
  const token = auth.getBearerToken();
  const cleanup = auth.clearAuthSession({ afterTokenRead: token });
  assert.equal(localStorage.getItem('wajeh_token'), null);
  ready.resolve();
  assert.equal(await token, 'legacy-token');
  await cleanup;
  assert.equal(stored.size, 0);
  assert.equal(await auth.getBearerToken(), '');
});
