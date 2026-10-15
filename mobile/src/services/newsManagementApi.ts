import { nativeSessionApiBase, type NativeSessionController } from '../domain/nativeSession';
import { canManageNews, decodeNewsCommittees, decodeNewsConfiguration, newsEntriesSnapshot, normalizeNewsEntries,
  type NewsConfiguration, type NewsEntry, type NewsManagementData } from '../domain/newsManagement';
import { NativeApiError } from './nativeApi';

interface PendingNews { target: NewsConfiguration }
const pendingByController = new WeakMap<NativeSessionController, Map<string, PendingNews>>();
const runningByController = new WeakMap<NativeSessionController, Set<string>>();
export function createNewsManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(), actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const context = JSON.stringify([nativeSessionApiBase(controller), actor.complex.registrationNumber, actor.role, actor.id]);
  const pending = pendingByController.get(controller) ?? new Map<string, PendingNews>(); pendingByController.set(controller, pending);
  const running = runningByController.get(controller) ?? new Set<string>(); runningByController.set(controller, running);
  function current() {
    const state = controller.getSnapshot(), identity = state.session;
    if (state.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (context !== JSON.stringify([nativeSessionApiBase(controller), identity.complex.registrationNumber, identity.role, identity.id])) throw new NativeApiError('cancelled');
    if (!canManageNews(identity)) throw new NativeApiError('forbidden');
  }
  current();
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T, dispatch?: () => void): Promise<T> {
    current();
    try { dispatch?.(); const result = await controller.request(path, options, decode); current(); return result; }
    catch (cause) { current(); throw cause; }
  }
  const configuration = (signal?: AbortSignal) => request('/student-news/manage', { signal }, decodeNewsConfiguration);
  const audience = (signal?: AbortSignal) => request('/student-news/audience', { signal }, decodeNewsCommittees);
  const matches = (left: NewsConfiguration, right: NewsConfiguration): boolean => left.revision === right.revision && newsEntriesSnapshot(left.entries) === newsEntriesSnapshot(right.entries);
  return {
    scopeKey: () => context,
    assertActive: current,
    hasUncertainOperation: () => pending.has(context),
    async load(signal?: AbortSignal): Promise<NewsManagementData> {
      current(); if (running.has(context)) throw new NativeApiError('conflict');
      const [config, committees] = await Promise.all([configuration(signal), audience(signal)]); current();
      const operation = pending.get(context); if (operation && matches(config, operation.target)) pending.delete(context);
      return Object.freeze({ ...config, committees, scopeKey: context, uncertainOperation: pending.has(context) });
    },
    async saveEntries({ entries, expected }: { entries: readonly NewsEntry[]; expected: NewsConfiguration }): Promise<{ verified: true }> {
      current(); const normalized = normalizeNewsEntries(entries), previous = decodeNewsConfiguration(expected);
      if (running.has(context) || pending.has(context)) throw new NativeApiError('conflict');
      running.add(context); let dispatched = false, acknowledged = false;
      try {
        const [fresh, committees] = await Promise.all([configuration(), audience()]);
        if (!matches(fresh, previous)) throw new NativeApiError('conflict', 409);
        if (normalized.some(row => row.committeeIds.some(id => !committees.some(committee => committee.id === id)))) throw new NativeApiError('validation');
        // Legacy targets can only be preserved by an unchanged entry. Explicit
        // editor saves remove the old target just like the existing web editor.
        if (normalized.some(row => {
          if (row.legacyStudentIds === undefined) return false;
          const before = previous.entries.find(old => old.id === row.id)?.legacyStudentIds;
          return !!(row.legacyStudentIds.length || before?.length) && JSON.stringify(before) !== JSON.stringify(row.legacyStudentIds);
        })) throw new NativeApiError('validation');
        const target = Object.freeze({ entries: normalized, revision: previous.revision + 1 }); pending.set(context, { target });
        const saved = await request('/student-news/manage', { method: 'PUT', body: { entries: normalized, revision: previous.revision } }, value => {
          const response = decodeNewsConfiguration(value);
          // New images are normalized by sharp on the server. Acknowledgement
          // establishes that exact image; unknown replies never guess it.
          const expectedResponse = normalized.map(row => {
            const actual = response.entries.find(entry => entry.id === row.id), before = previous.entries.find(entry => entry.id === row.id);
            if (!actual || (row.image && row.image !== before?.image && !actual.image)) throw new NativeApiError('invalid-response');
            return row.image && row.image !== before?.image ? { ...row, image: actual.image } : row;
          });
          if (response.revision !== target.revision || newsEntriesSnapshot(response.entries) !== newsEntriesSnapshot(expectedResponse)) throw new NativeApiError('invalid-response');
          pending.set(context, { target: response }); acknowledged = true; return response;
        }, () => { dispatched = true; });
        const confirmed = await configuration(); if (!matches(confirmed, saved)) throw new NativeApiError('invalid-response');
        current(); pending.delete(context); return { verified: true };
      } catch (cause) {
        const rejected = cause instanceof NativeApiError && !!cause.status && [400, 401, 403, 404, 409, 413, 422].includes(cause.status);
        if (!dispatched || (!acknowledged && rejected)) pending.delete(context); throw cause;
      } finally { running.delete(context); }
    },
  };
}
export type NewsManagementApi = ReturnType<typeof createNewsManagementApi>;
