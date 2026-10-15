import { NativeApiError, normalizeNativeApiBase, normalizeRegistrationNumber, validNativeToken,
  type NativeApi, type NativeApiRequestOptions, type NativeLoginInput } from '../services/nativeApi';

export type NativeRole = 'manager' | 'student' | 'supervisor' | 'admin';
export interface NativeSession {
  readonly role: NativeRole;
  readonly id: number;
  readonly name: string;
  readonly dashboardPermissions: readonly string[];
  readonly complex: Readonly<{ registrationNumber: string; name: string }>;
}
export interface StoredNativeSession {
  readonly version: 1;
  readonly apiBase: string;
  readonly registrationNumber: string;
  readonly token: string;
  readonly id: number;
  readonly role: NativeRole;
}
export interface SessionStorage {
  load(): Promise<StoredNativeSession | null>;
  save(session: StoredNativeSession): Promise<void>;
  clear(): Promise<void>;
}
export type NativeSessionStatus = 'signed-out' | 'restoring' | 'signing-in' | 'authenticated' | 'offline' | 'error';
export interface NativeSessionSnapshot {
  readonly status: NativeSessionStatus;
  readonly session: NativeSession | null;
  readonly error: NativeApiError | null;
}
export interface NativeLogoutResult { localCleared: boolean; serverRevoked: boolean; error: NativeApiError | null }
export interface NativeSessionController {
  getSnapshot(): NativeSessionSnapshot;
  subscribe(listener: () => void): () => void;
  login(input: NativeLoginInput, options?: { expectedRole?: NativeRole; signal?: AbortSignal }): Promise<void>;
  restore(options?: { signal?: AbortSignal }): Promise<void>;
  logout(): Promise<NativeLogoutResult>;
  cancel(): void;
  request<T = unknown>(path: string, options?: Omit<NativeApiRequestOptions, 'token' | 'registrationNumber'>,
    decode?: (body: unknown) => T): Promise<T>;
}
const controllerApiBases = new WeakMap<NativeSessionController, string>();
interface ExternalActivityGuard {
  pending(): boolean;
  run<T>(work: () => Promise<T>): Promise<T>;
}
const externalActivityGuards = new WeakMap<NativeSessionController, ExternalActivityGuard>();
export function nativeExternalActivityPending(controller: NativeSessionController): boolean {
  return externalActivityGuards.get(controller)?.pending() ?? false;
}
export function withVerifiedNativeExternalActivity<T>(controller: NativeSessionController, work: () => Promise<T>): Promise<T> {
  const guard = externalActivityGuards.get(controller);
  if (!guard) return Promise.reject(new NativeApiError('configuration'));
  return guard.run(work);
}
export function nativeSessionApiBase(controller: NativeSessionController): string {
  const base = controllerApiBases.get(controller);
  if (!base) throw new NativeApiError('configuration');
  return base;
}
export function parseStoredNativeSession(value: unknown): StoredNativeSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NativeApiError('storage');
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !validNativeToken(record.token) || typeof record.id !== 'number'
    || !Number.isSafeInteger(record.id) || record.id <= 0
    || !['manager', 'student', 'supervisor', 'admin'].includes(String(record.role))
    || typeof record.registrationNumber !== 'string') throw new NativeApiError('storage');
  try {
    return Object.freeze({ version: 1, apiBase: normalizeNativeApiBase(record.apiBase),
      registrationNumber: normalizeRegistrationNumber(record.registrationNumber), token: record.token,
      id: record.id, role: record.role as NativeRole });
  } catch { throw new NativeApiError('storage'); }
}
function safeError(cause: unknown): NativeApiError {
  return cause instanceof NativeApiError ? cause : new NativeApiError('network');
}

export function createNativeSession({ api, storage }: { api: NativeApi; storage: SessionStorage }): NativeSessionController {
  let epoch = 0;
  let credential: StoredNativeSession | null = null;
  let snapshot: NativeSessionSnapshot = Object.freeze({ status: 'signed-out', session: null, error: null });
  let storageQueue: Promise<void> = Promise.resolve();
  let pendingLogout: Promise<NativeLogoutResult> | null = null;
  let externalActivityVersion: number | null = null;
  const listeners = new Set<() => void>();
  const requests = new Set<AbortController>();
  function publish(status: NativeSessionStatus, session: NativeSession | null = null, error: NativeApiError | null = null) {
    snapshot = Object.freeze({ status, session, error });
    listeners.forEach(listener => listener());
  }
  function advance() {
    epoch += 1;
    externalActivityVersion = null;
    requests.forEach(request => request.abort());
    requests.clear();
    return epoch;
  }
  function current(version: number) { if (epoch !== version) throw new NativeApiError('cancelled'); }
  function track(signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    requests.add(controller);
    return { signal: controller.signal, finish: () => {
      requests.delete(controller); signal?.removeEventListener('abort', abort);
    } };
  }
  async function persisted<T>(work: () => Promise<T>): Promise<T> {
    const result = storageQueue.then(work);
    // The caller receives failures; the queue must still permit a later clear.
    storageQueue = result.then(() => undefined, () => undefined);
    try { return await result; }
    catch { throw new NativeApiError('storage'); }
  }
  async function clear(version: number) {
    await persisted(async () => { current(version); await storage.clear(); });
    current(version);
  }
  async function revoke(record: StoredNativeSession): Promise<boolean> {
    try { await api.logout(record); return true; }
    catch (cause) { return cause instanceof NativeApiError && cause.code === 'unauthorized'; }
  }
  function saved(identity: NativeSession, token: string): StoredNativeSession {
    return Object.freeze({ version: 1, apiBase: api.baseUrl, token, id: identity.id,
      role: identity.role, registrationNumber: identity.complex.registrationNumber });
  }
  const controller: NativeSessionController = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => {
      advance();
      if (snapshot.status === 'signing-in' || snapshot.status === 'restoring') publish('signed-out');
    },
    login: async (input, options) => {
      const version = advance();
      const request = track(options?.signal);
      credential = null;
      publish('signing-in');
      let issued: StoredNativeSession | null = null;
      try {
        await clear(version);
        if (pendingLogout) await pendingLogout;
        current(version);
        const response = await api.login(input, { signal: request.signal });
        issued = saved(response, response.token);
        current(version);
        if (request.signal.aborted) throw new NativeApiError('cancelled');
        if (options?.expectedRole && response.role !== options.expectedRole) throw new NativeApiError('forbidden');
        const requestedTenant = normalizeRegistrationNumber(input.registrationNumber);
        if (requestedTenant && requestedTenant !== response.complex.registrationNumber) throw new NativeApiError('invalid-response');
        const toSave = issued;
        await persisted(async () => { current(version); await storage.save(toSave); });
        current(version);
        credential = issued;
        const identity: NativeSession = { role: response.role, id: response.id, name: response.name,
          dashboardPermissions: response.dashboardPermissions, complex: response.complex };
        publish('authenticated', Object.freeze(identity));
      } catch (cause) {
        if (issued) {
          const revoked = await revoke(issued);
          if (!revoked && cause instanceof NativeApiError) cause.cleanupFailed = true;
        }
        current(version);
        const error = safeError(cause);
        try { await clear(version); } catch { error.cleanupFailed = true; }
        current(version);
        publish('error', null, error);
        throw error;
      } finally { request.finish(); }
    },
    restore: async options => {
      const version = advance();
      const request = track(options?.signal);
      credential = null;
      publish('restoring');
      try {
        const stored = await persisted(() => storage.load());
        current(version);
        if (!stored) { publish('signed-out'); return; }
        const record = parseStoredNativeSession(stored);
        if (record.apiBase !== api.baseUrl) { await clear(version); publish('signed-out'); return; }
        // Kept privately for logout even while verification is offline. It never
        // grants an authenticated state or access to session.request by itself.
        credential = record;
        const identity = await api.session(record, { signal: request.signal });
        current(version);
        if (identity.id !== record.id || identity.role !== record.role
          || identity.complex.registrationNumber !== record.registrationNumber) throw new NativeApiError('invalid-response');
        credential = record;
        publish('authenticated', identity);
      } catch (cause) {
        current(version);
        const error = safeError(cause);
        if (['network', 'timeout', 'cancelled'].includes(error.code)) {
          publish(error.code === 'cancelled' ? 'signed-out' : 'offline', null, error);
        } else {
          credential = null;
          try { await clear(version); } catch { error.cleanupFailed = true; }
          current(version);
          publish('error', null, error);
        }
        throw error;
      } finally { request.finish(); }
    },
    logout: () => {
      if (pendingLogout) {
        if (snapshot.status === 'signing-in' || snapshot.status === 'restoring') {
          advance(); credential = null; publish('signed-out');
        }
        return pendingLogout;
      }
      const captured = credential;
      const version = advance();
      credential = null;
      publish('signed-out');
      pendingLogout = (async () => {
        let error: NativeApiError | null = null;
        let localCleared = false;
        let previous = captured;
        let hadCredential = Boolean(previous);
        // Logout can happen before restore has verified the server identity.
        // Read only the secure credential to revoke it, never to authorize UI.
        if (!previous) {
          try {
            const stored = await persisted(() => storage.load());
            hadCredential = Boolean(stored);
            if (stored) {
              const parsed = parseStoredNativeSession(stored);
              if (parsed.apiBase !== api.baseUrl) error = new NativeApiError('storage');
              else previous = parsed;
            }
          } catch { hadCredential = true; error = new NativeApiError('storage'); }
        }
        // Logout's clear precedes any later login save in the shared storage queue.
        // It must complete even if the user begins signing in again meanwhile.
        try { await persisted(() => storage.clear()); localCleared = true; } catch { error = new NativeApiError('storage'); }
        let serverRevoked = !hadCredential;
        if (previous) {
          try { await api.logout(previous); serverRevoked = true; }
          catch (cause) {
            const failure = safeError(cause);
            serverRevoked = failure.code === 'unauthorized';
            if (!serverRevoked) error ??= failure;
          }
        }
        if (epoch === version && error) publish('signed-out', null, error);
        return { localCleared, serverRevoked, error };
      })().finally(() => { pendingLogout = null; });
      return pendingLogout;
    },
    request: async (path, options, decode) => {
      const version = epoch;
      const active = credential;
      if (!active || snapshot.status !== 'authenticated') throw new NativeApiError('unauthorized');
      if (externalActivityVersion === epoch) throw new NativeApiError('cancelled');
      const request = track(options?.signal);
      try {
        const result = await api.request(path, { ...options, token: active.token,
          registrationNumber: active.registrationNumber, signal: request.signal }, decode);
        current(version);
        return result;
      } catch (cause) {
        current(version);
        const error = safeError(cause);
        if (error.code === 'unauthorized') {
          const clearedVersion = advance();
          credential = null;
          publish('signed-out', null, error);
          try { await clear(clearedVersion); } catch { error.cleanupFailed = true; }
        }
        throw error;
      } finally { request.finish(); }
    },
  };
  controllerApiBases.set(controller, api.baseUrl);
  externalActivityGuards.set(controller, {
    pending: () => externalActivityVersion === epoch,
    run: async <T>(work: () => Promise<T>): Promise<T> => {
      const record = credential;
      const previous = snapshot.session;
      if (!record || !previous || snapshot.status !== 'authenticated') throw new NativeApiError('unauthorized');
      if (externalActivityVersion === epoch) throw new NativeApiError('conflict');
      const version = advance();
      externalActivityVersion = version;
      let request: ReturnType<typeof track> | null = null;
      try {
        // Keep the editor mounted while the native picker owns the screen. No
        // protected request is permitted until the returned identity is verified.
        let outcome: { ok: true; value: T } | { ok: false; error: unknown };
        try { outcome = { ok: true, value: await work() }; }
        catch (error) { outcome = { ok: false, error }; }
        current(version);
        request = track();
        let identity: NativeSession;
        try {
          identity = await api.session(record, { signal: request.signal });
          current(version);
          if (identity.id !== record.id || identity.role !== record.role
            || identity.complex.registrationNumber !== record.registrationNumber) throw new NativeApiError('invalid-response');
        } catch (cause) {
          current(version);
          const error = safeError(cause);
          if (['network', 'timeout', 'cancelled'].includes(error.code)) {
            publish(error.code === 'cancelled' ? 'signed-out' : 'offline', null, error);
          } else {
            credential = null;
            try { await clear(version); } catch { error.cleanupFailed = true; }
            current(version);
            publish('error', null, error);
          }
          throw error;
        }
        const unchanged = identity.name === previous.name && identity.complex.name === previous.complex.name
          && identity.dashboardPermissions.length === previous.dashboardPermissions.length
          && identity.dashboardPermissions.every(permission => previous.dashboardPermissions.includes(permission));
        if (!unchanged) {
          advance(); publish('authenticated', identity);
          throw new NativeApiError('cancelled');
        }
        if (!outcome.ok) throw outcome.error;
        return outcome.value;
      } finally {
        request?.finish();
        if (externalActivityVersion === version) externalActivityVersion = null;
      }
    },
  });
  return controller;
}
