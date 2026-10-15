import type { NativeRole, NativeSession } from '../domain/nativeSession';
import { normalizeSiteRegistrationNumber } from '../../../shared/registration-link.js';

export type NativeApiErrorCode = 'configuration' | 'validation' | 'unauthorized' | 'forbidden' | 'conflict'
  | 'not-found' | 'rate-limited' | 'server' | 'network' | 'timeout' | 'cancelled'
  | 'invalid-response' | 'storage';
const messages: Record<NativeApiErrorCode, string> = {
  configuration: 'عنوان الخدمة غير مهيأ.', validation: 'تحقق من البيانات المدخلة.',
  unauthorized: 'انتهت جلسة الدخول. سجل الدخول مجددًا.', forbidden: 'ليست لديك صلاحية لهذا الإجراء.',
  'not-found': 'البيانات المطلوبة غير موجودة.', 'rate-limited': 'محاولات كثيرة. انتظر ثم حاول مجددًا.',
  conflict: 'تعارض الطلب مع البيانات الحالية. حدّثها ثم حاول مجددًا.',
  server: 'تعذّر تنفيذ الطلب. حاول لاحقًا.', network: 'تعذّر الاتصال بالخدمة. تحقق من اتصالك.',
  timeout: 'استغرق الاتصال وقتًا طويلًا. حاول مجددًا.', cancelled: 'أُلغي الطلب.',
  'invalid-response': 'تعذّر التحقق من استجابة الخدمة.', storage: 'تعذّر حفظ جلسة الدخول بأمان.',
};
export class NativeApiError extends Error {
  cleanupFailed = false;
  constructor(readonly code: NativeApiErrorCode, readonly status?: number, readonly retryAfterMs?: number, login = false) {
    super(login && (status === 401 || status === 404) ? 'رقم الدخول أو كلمة المرور غير صحيحة.' : messages[code]);
    this.name = 'NativeApiError';
  }
}

export interface NativeApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  registrationNumber?: string;
  token?: string;
  signal?: AbortSignal;
}
export interface NativeLoginInput { loginNumber: string; password: string; registrationNumber?: string }
export interface NativeApiCredential { token: string; registrationNumber: string }
export interface NativeLoginResponse extends NativeSession { token: string }
export interface NativeApi {
  readonly baseUrl: string;
  request<T = unknown>(path: string, options?: NativeApiRequestOptions, decode?: (body: unknown) => T): Promise<T>;
  login(input: NativeLoginInput, options?: { signal?: AbortSignal }): Promise<NativeLoginResponse>;
  session(credential: NativeApiCredential, options?: { signal?: AbortSignal }): Promise<NativeSession>;
  logout(credential: NativeApiCredential, options?: { signal?: AbortSignal }): Promise<void>;
}
export type NativeFetch = (url: string, options: RequestInit) => Promise<Response>;
export function configuredNativeApiBase(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || undefined;
}
export function normalizeNativeApiBase(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new NativeApiError('configuration');
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      || url.username || url.password || url.search || url.hash) throw new NativeApiError('configuration');
    return url.toString().replace(/\/+$/, '');
  } catch { throw new NativeApiError('configuration'); }
}
export function validNativeToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
export function normalizeRegistrationNumber(value: unknown): string {
  if (value === undefined || value === '') return '';
  const normalized = normalizeSiteRegistrationNumber(value);
  if (!normalized) throw new NativeApiError('validation');
  return normalized;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
function parseIdentity(body: unknown): NativeSession {
  const value = object(body);
  if (!['manager', 'student', 'supervisor', 'admin'].includes(String(value.role))
    || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id <= 0
    || typeof value.name !== 'string') throw new NativeApiError('invalid-response');
  const complex = object(value.complex);
  if (typeof complex.registrationNumber !== 'string' || typeof complex.name !== 'string') throw new NativeApiError('invalid-response');
  let registrationNumber: string;
  try { registrationNumber = normalizeRegistrationNumber(complex.registrationNumber); }
  catch { throw new NativeApiError('invalid-response'); }
  const permissions = value.dashboardPermissions ?? (value.role === 'student' ? [] : null);
  if (!Array.isArray(permissions) || !permissions.every(item => typeof item === 'string')) throw new NativeApiError('invalid-response');
  return Object.freeze({ role: value.role as NativeRole, id: value.id, name: value.name,
    dashboardPermissions: Object.freeze([...new Set(permissions as string[])]),
    complex: Object.freeze({ registrationNumber, name: complex.name }) });
}
function parseLogin(body: unknown): NativeLoginResponse {
  const identity = parseIdentity(body);
  const token = object(body).token;
  if (!validNativeToken(token)) throw new NativeApiError('invalid-response');
  return Object.freeze({ ...identity, token });
}
function parseLogout(body: unknown): void {
  if (object(body).ok !== true) throw new NativeApiError('invalid-response');
}
function statusError(response: Response, login = false): NativeApiError {
  const status = response.status;
  const code = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not-found'
    : status === 409 ? 'conflict' : status === 422 || status === 413 || status === 400 ? 'validation' : status === 429 ? 'rate-limited' : 'server';
  const retry = response.headers.get('Retry-After');
  const retryAfterMs = retry ? Math.max(0, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : undefined;
  return new NativeApiError(code, status, Number.isFinite(retryAfterMs) ? retryAfterMs : undefined, login);
}

export function createNativeApi(options: { baseUrl?: string; fetch?: NativeFetch; timeoutMs?: number } = {}): NativeApi {
  const baseUrl = normalizeNativeApiBase(options.baseUrl ?? configuredNativeApiBase());
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new NativeApiError('configuration');
  async function request<T = unknown>(path: string, input: NativeApiRequestOptions = {}, decode?: (body: unknown) => T,
    loginResponse = false): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('#')) throw new NativeApiError('validation');
    const target = new URL(baseUrl + path);
    const base = new URL(baseUrl);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')) throw new NativeApiError('validation');
    const registrationNumber = normalizeRegistrationNumber(input.registrationNumber);
    if (input.token !== undefined && !validNativeToken(input.token)) throw new NativeApiError('unauthorized');
    const abort = new AbortController();
    let timedOut = false;
    const onAbort = () => abort.abort();
    if (input.signal?.aborted) throw new NativeApiError('cancelled');
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeoutMs);
    const checkCancelled = () => { if (abort.signal.aborted) throw new NativeApiError(timedOut ? 'timeout' : 'cancelled'); };
    try {
      let body: string | undefined;
      try { body = input.body === undefined ? undefined : JSON.stringify(input.body); }
      catch { throw new NativeApiError('validation'); }
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json',
        'X-Nukhab-Native': '1', 'X-Registration-Number': registrationNumber };
      if (input.token) headers.Authorization = `Bearer ${input.token}`;
      let response: Response;
      try { response = await fetcher(target.toString(), { method: input.method ?? 'GET', headers, body,
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: abort.signal }); }
      catch { checkCancelled(); throw new NativeApiError('network'); }
      // An aborted login may already have minted a server token. Read only a
      // successful auth response so that the token can be revoked before reject.
      if (!loginResponse || !response.ok) checkCancelled();
      if (!response.ok) throw statusError(response, loginResponse);
      let payload: unknown;
      try { payload = await response.json(); }
      catch { checkCancelled(); throw new NativeApiError('invalid-response'); }
      if (loginResponse && abort.signal.aborted) {
        const error = new NativeApiError(timedOut ? 'timeout' : 'cancelled');
        try {
          const issued = parseLogin(payload);
          await request('/auth/logout', { method: 'POST', body: {}, token: issued.token,
            registrationNumber: issued.complex.registrationNumber }, parseLogout);
        } catch (cause) { error.cleanupFailed = !(cause instanceof NativeApiError && cause.code === 'unauthorized'); }
        throw error;
      }
      checkCancelled();
      if (!decode) return payload as T;
      try { return decode(payload); }
      catch { throw new NativeApiError('invalid-response'); }
    } finally { clearTimeout(timer); input.signal?.removeEventListener('abort', onAbort); }
  }
  return {
    baseUrl, request,
    login: (input, opts) => {
      if (typeof input.loginNumber !== 'string' || !input.loginNumber.trim()
        || typeof input.password !== 'string') return Promise.reject(new NativeApiError('validation'));
      const registrationNumber = normalizeRegistrationNumber(input.registrationNumber);
      return request('/auth/login', { method: 'POST', registrationNumber, signal: opts?.signal,
        body: { loginNumber: input.loginNumber.trim(), password: input.password } }, parseLogin, true);
    },
    session: (credential, opts) => {
      if (!validNativeToken(credential.token)) return Promise.reject(new NativeApiError('unauthorized'));
      return request('/auth/session', { ...credential, signal: opts?.signal }, parseIdentity);
    },
    logout: async (credential, opts) => {
      if (!validNativeToken(credential.token)) throw new NativeApiError('unauthorized');
      await request('/auth/logout', { ...credential, method: 'POST', body: {}, signal: opts?.signal }, parseLogout);
    },
  };
}
