import { notificationRoleLabels, notificationRoles } from '../../../shared/notification-roles.js';
import type { NativeRole } from './nativeSession';
import { NativeApiError } from '../services/nativeApi';

export { notificationRoleLabels };
export interface NotificationPerson { id: number; name: string; role: NativeRole; committeeId: number | null }
export interface NotificationAudience { people: NotificationPerson[]; committees: { id: number; name: string }[] }
export interface NotificationSelection { roles: NativeRole[]; committeeIds: string[]; people: string[] }
export interface NotificationDraft { title: string; body: string; selection: NotificationSelection }
export interface NotificationPayload extends NotificationDraft { requestId: string }
export interface NotificationHistory {
  id: number; title: string; body: string; createdBy: string; createdAt: string;
  recipientCount: number; readCount: number; pushSent: number; pushPending: number; pushFailed: number;
}
export interface NotificationRecipient { id: number; role: NativeRole; name: string; readAt: string | null }
export interface AccountNotification { id: string; title: string; body: string; createdAt: string; isRead: boolean }
export interface NotificationSendResult { id: number | null; duplicate: boolean; recipientCount: number | null }
export function emptyNotificationSelection(): NotificationSelection { return { roles: [], committeeIds: [], people: [] }; }
export function notificationPersonKey(person: Pick<NotificationPerson, 'role' | 'id'>): string { return `${person.role}:${person.id}`; }
export function notificationPersonSelected(person: NotificationPerson, selection: NotificationSelection): boolean {
  return selection.roles.includes(person.role) || (person.role === 'student' && selection.committeeIds.includes(String(person.committeeId)))
    || selection.people.includes(notificationPersonKey(person));
}
export function selectedNotificationPeople(audience: NotificationAudience, selection: NotificationSelection): NotificationPerson[] {
  return audience.people.filter(person => notificationPersonSelected(person, selection));
}
export function normalizeNotificationDraft(draft: NotificationDraft, audience: NotificationAudience): NotificationDraft {
  const title = draft.title.trim(), body = draft.body.trim();
  if (!title || title.length > 180 || !body || body.length > 4000) throw new NativeApiError('validation');
  const selection = draft.selection;
  if (!selection || !Array.isArray(selection.roles) || !Array.isArray(selection.committeeIds) || !Array.isArray(selection.people)
    || selection.roles.some(role => !notificationRoles.includes(role))
    || selection.committeeIds.some(id => typeof id !== 'string' || !audience.committees.some(row => String(row.id) === id))
    || selection.people.some(key => typeof key !== 'string' || !audience.people.some(row => notificationPersonKey(row) === key))) throw new NativeApiError('validation');
  const normalized: NotificationDraft = { title, body, selection: {
    roles: [...new Set(selection.roles)].sort(), committeeIds: [...new Set(selection.committeeIds)].sort(), people: [...new Set(selection.people)].sort(),
  } };
  if (!selectedNotificationPeople(audience, normalized.selection).length) throw new NativeApiError('validation');
  return normalized;
}
export function normalizeNotificationReadIds(ids: readonly string[]): string[] {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[1-9]\d*$/.test(id)
    || !Number.isSafeInteger(Number(id)))) throw new NativeApiError('validation');
  return [...new Set(ids)];
}
