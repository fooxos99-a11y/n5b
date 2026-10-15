import { hasManagementGrant } from '../domain/management';
import type { NativeRole, NativeSessionController, NativeSessionSnapshot } from '../domain/nativeSession';
import { normalizeNotificationDraft, normalizeNotificationReadIds, type AccountNotification, type NotificationAudience,
  type NotificationDraft, type NotificationHistory, type NotificationPayload, type NotificationPerson, type NotificationRecipient,
  type NotificationSendResult } from '../domain/notifications';
import { NativeApiError } from './nativeApi';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string') throw new NativeApiError('invalid-response'); return value; }
function number(value: unknown, minimum = 0): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) throw new NativeApiError('invalid-response');
  const result = Number(value); if (!Number.isSafeInteger(result) || result < minimum) throw new NativeApiError('invalid-response'); return result;
}
function role(value: unknown): NativeRole {
  if (!['student', 'supervisor', 'admin', 'manager'].includes(String(value))) throw new NativeApiError('invalid-response'); return value as NativeRole;
}
function rows<T>(value: unknown, decode: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); return value.map(decode);
}
export function decodeNotificationAudience(value: unknown): NotificationAudience {
  const result = record(value);
  const people = rows(result.people, value => {
    const row = record(value); const personRole = role(row.role);
    const person: NotificationPerson = { id: number(row.id, 1), name: text(row.name), role: personRole,
      committeeId: row.committeeId === null ? null : number(row.committeeId, 1) };
    if (personRole !== 'student' && person.committeeId !== null) throw new NativeApiError('invalid-response'); return person;
  });
  const committees = rows(result.committees, value => { const row = record(value); return { id: number(row.id, 1), name: text(row.name) }; });
  if (new Set(people.map(row => `${row.role}:${row.id}`)).size !== people.length || new Set(committees.map(row => row.id)).size !== committees.length) throw new NativeApiError('invalid-response');
  return { people, committees };
}
export function decodeNotificationHistory(value: unknown): NotificationHistory {
  const row = record(value); const recipientCount = number(row.recipientCount), readCount = number(row.readCount);
  if (readCount > recipientCount) throw new NativeApiError('invalid-response');
  return { id: number(row.id, 1), title: text(row.title), body: text(row.body), createdBy: text(row.createdBy), createdAt: text(row.createdAt),
    recipientCount, readCount, pushSent: number(row.pushSent), pushPending: number(row.pushPending), pushFailed: number(row.pushFailed) };
}
export function decodeNotificationRecipient(value: unknown): NotificationRecipient {
  const row = record(value); return { id: number(row.id, 1), role: role(row.role), name: text(row.name),
    readAt: row.readAt === null ? null : text(row.readAt) };
}
export function decodeAccountNotification(value: unknown): AccountNotification {
  const row = record(value); if (typeof row.isRead !== 'boolean') throw new NativeApiError('invalid-response');
  // The existing inbox contract has no destination. Extra fields cannot become navigation actions.
  return { id: String(number(row.id, 1)), title: text(row.title), body: text(row.body), createdAt: text(row.createdAt), isRead: row.isRead };
}
export function decodeNotificationSendResult(value: unknown): NotificationSendResult {
  const row = record(value); const duplicate = row.duplicate === true;
  if (row.duplicate !== undefined && !duplicate) throw new NativeApiError('invalid-response');
  const id = row.id === undefined && duplicate ? null : number(row.id, 1);
  const recipientCount = row.recipientCount === undefined && duplicate ? null : number(row.recipientCount, 1);
  return { id, duplicate, recipientCount };
}
let scopeInstance = 0;
function createScope(controller: NativeSessionController, management: boolean) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const key = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  const instance = ++scopeInstance; let viewVersion = 0, viewSnapshot = initial;
  function viewKey(): string {
    const current = controller.getSnapshot();
    if (current !== viewSnapshot) { viewSnapshot = current; viewVersion += 1; }
    return `${instance}:${viewVersion}`;
  }
  let forbiddenSnapshot: NativeSessionSnapshot | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  function assertActive() {
    const current = controller.getSnapshot(), identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (key !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (current === forbiddenSnapshot || (management && !hasManagementGrant(identity, 'notifications'))) throw new NativeApiError('forbidden');
  }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T) {
    assertActive();
    try { const result = await controller.request(path, options, decode); assertActive(); return result; }
    catch (cause) {
      if (cause instanceof NativeApiError && cause.code === 'forbidden') { forbiddenSnapshot = controller.getSnapshot(); emit(); }
      throw cause;
    }
  }
  return { key, viewKey, assertActive, request, canAccess: () => { try { assertActive(); return true; } catch { return false; } },
    subscribe: (listener: () => void) => { listeners.add(listener); const unsubscribe = controller.subscribe(listener); return () => { listeners.delete(listener); unsubscribe(); }; }, emit };
}
interface NotificationPending { payload: NotificationPayload; uncertain: boolean }
interface SendState { pending: NotificationPending | null; inFlight: Promise<NotificationSendResult> | null; listeners: Set<() => void> }
const sendStates = new WeakMap<NativeSessionController, Map<string, SendState>>();
export function createNotificationsManagementApi(controller: NativeSessionController, options: { uuid: () => string }) {
  const scope = createScope(controller, true); const scoped = sendStates.get(controller) ?? new Map<string, SendState>();
  const state = scoped.get(scope.key) ?? { pending: null, inFlight: null, listeners: new Set<() => void>() }; scoped.set(scope.key, state); sendStates.set(controller, scoped);
  const emit = () => state.listeners.forEach(listener => listener());
  function pending(): NotificationPayload | null { scope.assertActive(); return state.pending?.payload ?? null; }
  async function sendPending(): Promise<NotificationSendResult> {
    scope.assertActive();
    if (state.inFlight) { const result = await state.inFlight; scope.assertActive(); return result; }
    const saved = state.pending; if (!saved) throw new NativeApiError('conflict');
    const operation = (async () => {
      try {
        const result = await scope.request('/notification-management', { method: 'POST', body: saved.payload }, decodeNotificationSendResult);
        state.pending = null; return result;
      } catch (cause) {
        const failure = cause instanceof NativeApiError ? cause : new NativeApiError('network');
        const rejected = !saved.uncertain && failure.status !== undefined && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status);
        if (rejected) state.pending = null; else saved.uncertain = true;
        throw failure;
      } finally { state.inFlight = null; emit(); }
    })();
    state.inFlight = operation; return operation;
  }
  return {
    scopeKey: () => scope.key, viewKey: scope.viewKey,
    subscribe: (listener: () => void) => { state.listeners.add(listener); const unsubscribe = scope.subscribe(listener);
      return () => { state.listeners.delete(listener); unsubscribe(); }; },
    assertActive: scope.assertActive, canManage: scope.canAccess, pending,
    pendingSnapshot: () => scope.canAccess() ? state.pending?.payload ?? null : null,
    async load(signal?: AbortSignal): Promise<{ audience: NotificationAudience; history: NotificationHistory[] }> {
      scope.assertActive(); const [audience, history] = await Promise.all([
        scope.request('/notification-management/audience', { signal }, decodeNotificationAudience),
        scope.request('/notification-management', { signal }, value => rows(value, decodeNotificationHistory)),
      ]); scope.assertActive(); return { audience, history };
    },
    loadRecipients(id: number, signal?: AbortSignal): Promise<NotificationRecipient[]> {
      scope.assertActive(); if (!Number.isSafeInteger(id) || id <= 0) return Promise.reject(new NativeApiError('validation'));
      return scope.request(`/notification-management/${id}/recipients`, { signal }, value => rows(value, decodeNotificationRecipient));
    },
    async send(draft: NotificationDraft, audience: NotificationAudience): Promise<NotificationSendResult> {
      scope.assertActive(); const normalized = normalizeNotificationDraft(draft, audience);
      if (state.pending) {
        const previous = { title: state.pending.payload.title, body: state.pending.payload.body, selection: state.pending.payload.selection };
        if (JSON.stringify(previous) !== JSON.stringify(normalized)) throw new NativeApiError('conflict');
      } else {
        const requestId = options.uuid(); if (!/^[a-f\d-]{36}$/i.test(requestId)) throw new NativeApiError('validation');
        const payload = { ...normalized, requestId };
        Object.freeze(payload.selection.roles); Object.freeze(payload.selection.committeeIds); Object.freeze(payload.selection.people);
        Object.freeze(payload.selection); Object.freeze(payload); state.pending = { payload, uncertain: false }; emit();
      }
      return sendPending();
    },
    retryPending: sendPending,
  };
}
export type NotificationsManagementApi = ReturnType<typeof createNotificationsManagementApi>;
export function createAccountNotificationsApi(controller: NativeSessionController) {
  const scope = createScope(controller, false); let marking: Promise<void> | null = null;
  return {
    scopeKey: () => scope.key, viewKey: scope.viewKey, subscribe: scope.subscribe, assertActive: scope.assertActive, canRead: scope.canAccess,
    load: (signal?: AbortSignal): Promise<AccountNotification[]> => scope.request('/notifications', { signal }, value => {
      const result = rows(value, decodeAccountNotification);
      if (result.length > 100 || new Set(result.map(row => row.id)).size !== result.length) throw new NativeApiError('invalid-response'); return result;
    }),
    async markRead(ids: readonly string[]): Promise<void> {
      scope.assertActive(); const normalized = normalizeNotificationReadIds(ids); if (!normalized.length) return;
      if (marking) throw new NativeApiError('conflict');
      marking = scope.request('/notifications/read', { method: 'POST', body: { ids: normalized } }, value => {
        if (record(value).ok !== true) throw new NativeApiError('invalid-response');
      });
      try { await marking; } finally { marking = null; }
    },
  };
}
export type AccountNotificationsApi = ReturnType<typeof createAccountNotificationsApi>;
