import type { NativeSessionController } from '../domain/nativeSession';
import { hasManagementGrant, positiveId, type ManagedCircle } from '../domain/management';
import { dashboardObject } from '../domain/studentDashboard';
import { decodeNarrationEvent, decodeNarrationEvents, decodeNarrationPartReference, decodeNarrationPreview, decodeNarrationPupils,
  decodeNarrationReferences, narrationEventFingerprint, narrationEventMatchesPreview, narrationPreviewFingerprint,
  narrationNoParticipants, newNarrationDraft, type NarrationDraft, type NarrationEvent, type NarrationEventRow, type NarrationPayload, type NarrationPreview } from '../domain/narrationManagement';
import { decodeManagedCircle } from './managementApi';
import { NativeApiError } from './nativeApi';

type Pending = { kind: 'create'; payload: NarrationPayload; preview: NarrationPreview; before: number[]; creatorName: string; id?: number }
  | { kind: 'archive'; event: NarrationEvent; targets: number[] }
  | { kind: 'delete'; event: NarrationEvent };
export interface NarrationReconciliation { kind: Pending['kind']; eventId: number; message: string }
export interface NarrationManagementData { events: NarrationEventRow[]; circles: ManagedCircle[]; reconciled: NarrationReconciliation | null }
// Retain uncertain writes through navigation within this authenticated controller; durable storage belongs to W10.
const pendingByController = new WeakMap<NativeSessionController, Map<string, Pending>>();
const draftsByController = new WeakMap<NativeSessionController, Map<string, NarrationDraft>>();
const copyDraft = (draft: NarrationDraft): NarrationDraft => ({ ...draft, committeeIds: [...draft.committeeIds],
  assignments: Object.fromEntries(Object.entries(draft.assignments).map(([id, ranges]) => [id, ranges.map(range => ({ ...range }))])) });
const unknownOutcome = (cause: unknown) => cause instanceof NativeApiError && ['network', 'timeout', 'server', 'invalid-response', 'cancelled'].includes(cause.code);
function ok(value: unknown) { const row = dashboardObject(value); if (row.ok !== true) throw new NativeApiError('invalid-response'); return row; }
export function createNarrationManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  const scopes = pendingByController.get(controller) ?? new Map<string, Pending>(); pendingByController.set(controller, scopes);
  const drafts = draftsByController.get(controller) ?? new Map<string, NarrationDraft>(); draftsByController.set(controller, drafts);
  let running = false;
  function assertContext() {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!hasManagementGrant(identity, 'narrationDay')) throw new NativeApiError('forbidden');
  }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T) {
    assertContext(); const result = await controller.request(path, options, decode); assertContext(); return result;
  }
  const events = (signal?: AbortSignal) => request('/narration-events', { signal }, decodeNarrationEvents);
  const event = (id: number, signal?: AbortSignal) => request(`/narration-events/${positiveId(id)}`, { signal }, value => decodeNarrationEvent(value, id));
  const preview = (payload: NarrationPayload, signal?: AbortSignal) => request('/narration-events/preparation-preview', { method: 'POST', body: payload, signal }, value => decodeNarrationPreview(value, payload));
  function ready() { assertContext(); if (running || scopes.has(scope)) throw new NativeApiError('conflict'); }
  async function fresh(source: NarrationEvent) {
    const current = await event(source.id); if (narrationEventFingerprint(current) !== narrationEventFingerprint(source)) throw new NativeApiError('conflict', 409);
  }
  async function reconcile(list: NarrationEventRow[], signal?: AbortSignal): Promise<NarrationReconciliation | null> {
    const pending = scopes.get(scope); if (!pending) return null;
    if (pending.kind === 'create') {
      const candidates = pending.id ? list.filter(row => row.id === pending.id) : list.filter(row => !pending.before.includes(row.id)
        && row.name === pending.payload.name && row.startDate === pending.payload.startDate && row.endDate === pending.payload.endDate);
      if (candidates.length > 10) throw new NativeApiError('conflict');
      const matching: NarrationEvent[] = [];
      for (const candidate of candidates) { const detail = await event(candidate.id, signal);
        if (detail.createdByName === pending.creatorName && narrationEventMatchesPreview(detail, pending.payload, pending.preview)) matching.push(detail);
      }
      if (matching.length !== 1) throw new NativeApiError('conflict');
      scopes.delete(scope); drafts.delete(scope); return { kind: 'create', eventId: matching[0]!.id,
        message: 'يوجد حدث مطابق للمعاينة وقد تحققت بياناته. لم تُتحقق نتيجة إرسال الرسائل.' };
    }
    if (pending.kind === 'archive') {
      const detail = await event(pending.event.id, signal);
      if (pending.targets.length ? !pending.targets.every(id => detail.students.some(student => student.id === id && !!student.archivedAt)) : detail.status !== 'archived') throw new NativeApiError('conflict');
      scopes.delete(scope); return { kind: 'archive', eventId: detail.id, message: 'تحققت أرشفة الطلاب المحددين. لم تُتحقق نتيجة إرسال الرسائل.' };
    }
    if (list.some(row => row.id === pending.event.id)) throw new NativeApiError('conflict');
    try { await event(pending.event.id, signal); throw new NativeApiError('conflict'); }
    catch (cause) { if (!(cause instanceof NativeApiError) || cause.code !== 'not-found') throw cause; }
    assertContext(); scopes.delete(scope); return { kind: 'delete', eventId: pending.event.id, message: 'تحققت إزالة الأرشيف من القائمة والتفاصيل.' };
  }
  async function write<T>(pending: Pending, work: () => Promise<T>) {
    scopes.set(scope, pending);
    try { return await work(); }
    catch (cause) { if (!unknownOutcome(cause)) scopes.delete(scope); throw cause; }
  }
  return {
    hasUncertainOperation: () => scopes.has(scope),
    readDraft: () => { assertContext(); return copyDraft(drafts.get(scope) ?? newNarrationDraft()); },
    keepDraft: (draft: NarrationDraft) => { assertContext(); drafts.set(scope, copyDraft(draft)); },
    async load(signal?: AbortSignal): Promise<NarrationManagementData> {
      assertContext(); if (running) throw new NativeApiError('conflict');
      const [list, circles] = await Promise.all([events(signal), request('/committees', { signal }, value => {
        if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); return value.map(decodeManagedCircle);
      })]);
      const reconciled = await reconcile(list, signal); return { events: list, circles, reconciled };
    },
    loadEvent: event,
    async loadPreparation(signal?: AbortSignal) {
      const [pupils, references] = await Promise.all([request('/narration-events/preparation', { signal }, decodeNarrationPupils),
        request('/narration-events/preparation-references', { signal }, decodeNarrationReferences)]);
      return { pupils, references };
    },
    preview: async (payload: NarrationPayload, signal?: AbortSignal) => { ready(); return preview(payload, signal); },
    async create(payload: NarrationPayload, reviewed: NarrationPreview) {
      ready(); running = true;
      try {
        const current = await preview(payload); if (narrationPreviewFingerprint(current) !== narrationPreviewFingerprint(reviewed)) throw new NativeApiError('conflict', 409);
        if (!current.students.length) throw new Error(narrationNoParticipants);
        const before = (await events()).map(row => row.id); assertContext();
        const pending: Pending = { kind: 'create', payload, preview: current, before, creatorName: controller.getSnapshot().session!.name };
        return await write(pending, async () => {
          const result = await request('/narration-events', { method: 'POST', body: payload }, value => {
            const row = ok(value); const id = Number(row.id); if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(row.studentsCount) || Number(row.studentsCount) !== current.students.length
              || typeof row.messageQueued !== 'boolean') throw new NativeApiError('invalid-response');
            return { id, messageQueued: row.messageQueued };
          });
          pending.id = result.id; const detail = await event(result.id);
          if (!narrationEventMatchesPreview(detail, payload, current)) throw new NativeApiError('invalid-response');
          scopes.delete(scope); drafts.delete(scope); return result;
        });
      } finally { running = false; }
    },
    async archive(source: NarrationEvent, committeeId: number | null) {
      ready(); if (source.status !== 'open') throw new NativeApiError('validation');
      if (committeeId !== null) positiveId(committeeId);
      const targets = source.students.filter(student => !student.archivedAt && (committeeId === null || student.committeeId === committeeId)).map(student => student.id);
      if (committeeId !== null && !targets.length) throw new NativeApiError('validation');
      running = true;
      try { await fresh(source); return await write({ kind: 'archive', event: source, targets }, async () => {
        const result = await request(`/narration-events/${source.id}/archive`, { method: 'POST', body: { committeeId } }, value => {
          const row = ok(value); if (typeof row.archivedAll !== 'boolean' || !Number.isSafeInteger(row.archivedStudents) || Number(row.archivedStudents) !== targets.length) throw new NativeApiError('invalid-response');
          return { archivedAll: row.archivedAll, archivedStudents: Number(row.archivedStudents) };
        });
        const detail = await event(source.id); if (targets.some(id => !detail.students.some(student => student.id === id && !!student.archivedAt))
          || result.archivedAll && detail.status !== 'archived') throw new NativeApiError('invalid-response');
        scopes.delete(scope); return result;
      }); } finally { running = false; }
    },
    async deleteArchive(source: NarrationEvent) {
      ready(); if (source.status !== 'archived') throw new NativeApiError('validation'); running = true;
      try { await fresh(source); return await write({ kind: 'delete', event: source }, async () => {
        await request(`/narration-events/${source.id}`, { method: 'DELETE' }, ok);
        if ((await events()).some(row => row.id === source.id)) throw new NativeApiError('invalid-response');
        try { await event(source.id); throw new NativeApiError('invalid-response'); }
        catch (cause) { if (!(cause instanceof NativeApiError) || cause.code !== 'not-found') throw cause; }
        assertContext(); scopes.delete(scope);
      }); } finally { running = false; }
    },
    async loadPartReference(source: NarrationEvent, partId: number, signal?: AbortSignal) {
      assertContext(); positiveId(partId); if (!source.students.some(student => student.parts.some(part => part.id === partId))) throw new NativeApiError('validation');
      return request(`/narration-events/${source.id}/parts/${partId}/ayahs`, { signal }, decodeNarrationPartReference);
    },
  };
}
export type NarrationManagementApi = ReturnType<typeof createNarrationManagementApi>;
