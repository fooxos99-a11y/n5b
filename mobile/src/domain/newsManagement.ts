import type { NativeSession } from './nativeSession';
import { hasManagementGrant } from './management';
import { validateStoreImageData } from './storeImage';
import { NativeApiError } from '../services/nativeApi';
import { hijriMonthRange, parseDateOnly } from '../../../shared/hijri-calendar.js';
import { newsTimeNow } from '../../../shared/student-news.js';

export interface NewsEntry {
  readonly id: string; readonly title: string; readonly body: string; readonly textColor: string; readonly image: string;
  readonly startsAt: string; readonly endsAt: string; readonly committeeIds: readonly number[]; readonly enabled: boolean;
  readonly legacyStudentIds?: readonly number[];
}
export interface NewsConfiguration { readonly entries: readonly NewsEntry[]; readonly revision: number }
export interface NewsCommittee { readonly id: number; readonly name: string }
export interface NewsManagementData extends NewsConfiguration {
  readonly scopeKey: string; readonly committees: readonly NewsCommittee[]; readonly uncertainOperation: boolean;
}
export type NewsDraft = { -readonly [Key in keyof NewsEntry]: NewsEntry[Key] };
export const canManageNews = (identity: NativeSession | null): boolean => hasManagementGrant(identity, 'settings');
function invalid(): never { throw new NativeApiError('validation'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value as Record<string, unknown>;
}
function ids(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) || new Set(value).size !== value.length) invalid();
  return Object.freeze([...value]);
}
function boundary(value: unknown, end: boolean): string {
  if (typeof value !== 'string') invalid();
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? '23:59' : '00:00'}` : value;
  if (time && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !parseDateOnly(time.slice(0, 10)))) invalid(); return time;
}
export function validateNewsImage(value: unknown): string {
  const result = validateStoreImageData(value);
  if (result && !/^data:image\/(?:png|jpeg|webp);base64,/.test(result)) invalid();
  if (result.length > 7_000_000) throw new Error('اختر صورة بحجم أقصاه ٥ ميجابايت.');
  if (result) {
    const encoded = result.slice(result.indexOf(',') + 1), padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (encoded.length * 3 / 4 - padding > 5 * 1024 * 1024) throw new Error('اختر صورة بحجم أقصاه ٥ ميجابايت.');
  }
  return result;
}
export function normalizeNewsEntry(value: unknown): NewsEntry {
  const row = object(value);
  if (typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id) || typeof row.title !== 'string'
    || !row.title.trim() || row.title.trim().length > 80 || (row.body !== undefined && typeof row.body !== 'string')
    || (typeof row.body === 'string' && row.body.trim().length > 2000) || (row.enabled !== undefined && typeof row.enabled !== 'boolean')) invalid();
  const textColor = row.textColor ?? '#000000'; if (typeof textColor !== 'string' || !/^#[\da-f]{6}$/i.test(textColor)) invalid();
  const startsAt = boundary(row.startsAt, false), endsAt = boundary(row.endsAt, true); if (startsAt && endsAt && startsAt > endsAt) invalid();
  return Object.freeze({ id: row.id, title: row.title.trim(), body: (row.body as string | undefined ?? '').trim(), textColor,
    startsAt, endsAt, committeeIds: ids(row.committeeIds), enabled: row.enabled !== false, image: validateNewsImage(row.image ?? ''),
    ...(row.legacyStudentIds === undefined ? {} : { legacyStudentIds: ids(row.legacyStudentIds) }) });
}
export function normalizeNewsEntries(value: unknown): readonly NewsEntry[] {
  if (!Array.isArray(value) || value.length > 8) invalid();
  const entries = value.map(normalizeNewsEntry); if (new Set(entries.map(row => row.id)).size !== entries.length) invalid();
  if (JSON.stringify(entries).length > 16 * 1024 * 1024 - 4096) throw new Error('حجم الصور الإجمالي كبير؛ قلل أحجامها.');
  return Object.freeze(entries);
}
export function decodeNewsConfiguration(value: unknown): NewsConfiguration {
  try {
    const row = object(value); if (typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 0) invalid();
    const entries = normalizeNewsEntries(row.entries); if (JSON.stringify(entries).length > 5_000_000) invalid();
    return Object.freeze({ entries, revision: row.revision });
  } catch { throw new NativeApiError('invalid-response'); }
}
export function decodeNewsCommittees(value: unknown): readonly NewsCommittee[] {
  try {
    if (!Array.isArray(value)) invalid();
    const rows = value.map(value => {
      const row = object(value);
      // MySQL may expose numeric ids as strings, matching the existing audience contract.
      if (typeof row.id !== 'number' && !(typeof row.id === 'string' && /^\d+$/.test(row.id))) invalid();
      const id = Number(row.id); if (!Number.isSafeInteger(id) || id < 1 || typeof row.name !== 'string' || !row.name.trim()) invalid();
      return Object.freeze({ id, name: row.name });
    });
    if (new Set(rows.map(row => row.id)).size !== rows.length) invalid(); return Object.freeze(rows);
  } catch { throw new NativeApiError('invalid-response'); }
}
export const newsEntriesSnapshot = (entries: readonly NewsEntry[]): string => JSON.stringify(entries.map(row => [row.id, row.title, row.body, row.textColor, row.image, row.startsAt, row.endsAt, [...row.committeeIds].sort((a, b) => a - b), row.enabled, [...row.legacyStudentIds ?? []].sort((a, b) => a - b)]));
export function emptyNewsDraft(id: string): NewsDraft {
  const startsAt = newsTimeNow().slice(0, 10), endsAt = hijriMonthRange(parseDateOnly(startsAt)).to;
  return { id, title: '', body: '', textColor: '#000000', image: '', committeeIds: [], enabled: true, startsAt, endsAt };
}
export function newsDraft(entry: NewsEntry): NewsDraft {
  return { ...entry, startsAt: entry.startsAt.slice(0, 10), endsAt: entry.endsAt.slice(0, 10) };
}
export function newsAudienceLabel(entry: NewsEntry, committees: readonly NewsCommittee[]): string {
  return entry.legacyStudentIds?.length ? 'تخصيص سابق' : !entry.committeeIds.length ? 'جميع الحلقات'
    : committees.filter(row => entry.committeeIds.includes(row.id)).map(row => row.name).join('، ');
}
export function newsDisplayStatus(entry: NewsEntry, now = newsTimeNow()): string {
  return !entry.enabled ? 'مخفي' : entry.endsAt && entry.endsAt < now ? 'انتهى العرض' : entry.startsAt && entry.startsAt > now ? 'مجدول' : 'معروض';
}
