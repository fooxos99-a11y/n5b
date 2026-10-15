import { getBusinessDate } from '../../../shared/business-date.js';
import { narrationCommitteeIds } from '../../../shared/narration-committee-scope.js';
import { groupNarrationParts, narrationOverallScore } from '../../../src/lib/narrationParts.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { RECITATION_MARK_LABELS } from '../../../shared/recitation-mark-types.js';
import { NativeApiError } from '../services/nativeApi';
import { dashboardObject, studentDate } from './studentDashboard';
import type { ManagedCircle } from './management';

const committeeIdsForScope = narrationCommitteeIds as (scope: { complexId: string; committeeIds: string[] }, circles: ManagedCircle[]) => string[];

export interface NarrationRange { startSurah: number; startAyah: number; endSurah: number; endAyah: number }
export interface NarrationMeasuredRange extends NarrationRange { startPage: number; endPage: number; faces: number }
export interface NarrationChapter { number: number; name: string; ayahCount: number; startPage: number; endPage: number }
export interface NarrationReferences { chapters: NarrationChapter[]; juzRanges: (NarrationRange & { juz: number; startPage: number; endPage: number; startSurahName: string; endSurahName: string })[] }
export interface NarrationPupil { studentId: number; name: string; committeeId: number | null; committeeName: string }
export interface NarrationJuzPart { juz: number; start: { surah: number; ayah: number; page: number }; end: { surah: number; ayah: number; page: number }; faces: number }
export interface NarrationPreparedPupil extends NarrationPupil { ranges: NarrationMeasuredRange[]; juzParts: NarrationJuzPart[]; totalFaces: number }
export interface NarrationPayload { name: string; startDate: string; endDate: string; scope: 'all' | 'committee'; committeeIds: number[]; mode: 'full' | 'manual'; assignments?: { studentId: number; ranges: NarrationRange[] }[] }
export interface NarrationPreview extends Omit<NarrationPayload, 'name' | 'assignments'> { students: NarrationPreparedPupil[]; skippedStudents: (NarrationPupil & { reason: 'no-ranges' })[] }
export interface NarrationDraft { name: string; startDate: string; endDate: string; complexId: string; committeeIds: string[]; mode: 'full' | 'manual'; assignments: Record<string, NarrationRange[]> }
export type NarrationRangeDraft = Record<keyof NarrationRange, string>;
export interface NarrationEventRow { id: number; name: string; startDate: string; endDate: string; status: 'open' | 'archived'; studentsCount: number }
export interface NarrationWordMark { page: number; startLocation: string; endLocation: string; selectedText: string; notes: string; markType: keyof typeof RECITATION_MARK_LABELS }
export interface NarrationSavedPart extends NarrationMeasuredRange {
  id: number; juzNumber: number; startSurahName: string; endSurahName: string; rangeLabel: string; isFullJuz: boolean;
  warningCount: number; hesitationCount: number; mistakeCount: number; score: number | null; evaluationMode: string;
  wordMarks: NarrationWordMark[]; evaluatorName: string; evaluatedAt: string;
}
export interface NarrationEntry extends NarrationPupil {
  id: number; status: 'pending' | 'in_progress' | 'completed' | 'absent' | 'excused'; totalFaces: number; finalScore: number | null;
  finalRating: string; archivedAt: string; parts: NarrationSavedPart[]; reciterNames: string[];
}
export interface NarrationEvent extends Omit<NarrationEventRow, 'studentsCount'> {
  scope: 'all' | 'committee'; committeeId: number | null; createdByName: string; createdAt: string; students: NarrationEntry[];
  evaluationPolicy: { maxScore: number; warningDeduction: number; hesitationDeduction: number; mistakeDeduction: number };
}
export interface NarrationPartReference { ayahs: { surah: number; ayah: number; textUthmani: string }[]; wordMarks: NarrationWordMark[] }
export const narrationStudentLabels = { pending: 'لم يبدأ', in_progress: 'جارٍ السرد', completed: 'مكتمل', absent: 'غائب', excused: 'مستأذن' };
export const narrationMarkLabels = RECITATION_MARK_LABELS;
export const narrationNoParticipants = 'لا يوجد طلاب بمحفوظ حتى تاريخ البداية. راجع التاريخ أو النطاقات قبل إنشاء يوم السرد.';
const invalid = (): never => { throw new NativeApiError('invalid-response'); };
function numeric(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, whole = false): number {
  const number = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) ? Number(value) : NaN;
  return Number.isFinite(number) && number >= min && number <= max && (!whole || Number.isSafeInteger(number)) ? number : invalid();
}
const id = (value: unknown) => numeric(value, 1, Number.MAX_SAFE_INTEGER, true);
const optionalId = (value: unknown) => value == null ? null : id(value);
function text(value: unknown, optional = false): string { return value == null && optional ? '' : typeof value === 'string' ? value : invalid(); }
function rows<T>(value: unknown, decode: (item: unknown) => T, max = 20000): T[] { return Array.isArray(value) && value.length <= max ? value.map(decode) : invalid(); }
function unique<T>(values: T[], key: (item: T) => number): T[] { return new Set(values.map(key)).size === values.length ? values : invalid(); }
const closeAmount = (first: number, second: number) => Math.abs(first - second) <= 0.03;
export function decodeNarrationRange(value: unknown): NarrationRange {
  const range = dashboardObject(value); const result = { startSurah: numeric(range.startSurah, 1, 114, true), startAyah: numeric(range.startAyah, 1, 286, true),
    endSurah: numeric(range.endSurah, 1, 114, true), endAyah: numeric(range.endAyah, 1, 286, true) };
  if (result.startSurah > result.endSurah || (result.startSurah === result.endSurah && result.startAyah > result.endAyah)) return invalid();
  return result;
}
function measuredRange(value: unknown): NarrationMeasuredRange {
  const range = dashboardObject(value); const result = { ...decodeNarrationRange(range), startPage: numeric(range.startPage, 1, 604, true),
    endPage: numeric(range.endPage, 1, 604, true), faces: numeric(range.faces, 0, 604) };
  return result.startPage <= result.endPage ? result : invalid();
}
function pupil(value: unknown): NarrationPupil { const row = dashboardObject(value); return { studentId: id(row.studentId ?? row.id), name: text(row.name ?? row.studentName), committeeId: optionalId(row.committeeId), committeeName: text(row.committeeName, true) }; }
export function decodeNarrationPupils(value: unknown): NarrationPupil[] { return unique(rows(value, pupil), row => row.studentId); }
export function decodeNarrationReferences(value: unknown): NarrationReferences {
  const result = dashboardObject(value);
  const chapters = unique(rows(result.chapters, raw => { const row = dashboardObject(raw); return { number: numeric(row.number, 1, 114, true), name: text(row.name),
    ayahCount: numeric(row.ayahCount, 1, 286, true), startPage: numeric(row.startPage, 1, 604, true), endPage: numeric(row.endPage, 1, 604, true) }; }, 114), row => row.number);
  const juzRanges = unique(rows(result.juzRanges, raw => { const row = dashboardObject(raw); return { ...decodeNarrationRange(row), juz: numeric(row.juz, 1, 30, true),
    startPage: numeric(row.startPage, 1, 604, true), endPage: numeric(row.endPage, 1, 604, true), startSurahName: text(row.startSurahName), endSurahName: text(row.endSurahName) }; }, 30), row => row.juz);
  if (!chapters.length || !juzRanges.length || chapters.some(row => row.endPage < row.startPage) || juzRanges.some(row => row.endPage < row.startPage)) return invalid();
  return { chapters, juzRanges };
}
function position(value: unknown) { const row = dashboardObject(value); return { surah: numeric(row.surah, 1, 114, true), ayah: numeric(row.ayah, 1, 286, true), page: numeric(row.page, 1, 604, true) }; }
export function decodeNarrationPreview(value: unknown, payload?: NarrationPayload): NarrationPreview {
  const row = dashboardObject(value); if (!['full', 'manual'].includes(String(row.mode)) || !['all', 'committee'].includes(String(row.scope))) return invalid();
  const committeeIds = unique(rows(row.committeeIds, id, 1000), value => value);
  const students = unique(rows(row.students, raw => { const student = dashboardObject(raw); const ranges = rows(student.ranges, measuredRange, 10000);
    const juzParts = rows(student.juzParts, raw => { const part = dashboardObject(raw); const start = position(part.start), end = position(part.end);
      decodeNarrationRange({ startSurah: start.surah, startAyah: start.ayah, endSurah: end.surah, endAyah: end.ayah }); if (start.page > end.page) return invalid();
      return { juz: numeric(part.juz, 1, 30, true), start, end, faces: numeric(part.faces, 0, 604) }; }, 10000);
    const totalFaces = numeric(student.totalFaces, 0, 604); if (!ranges.length || !juzParts.length || !closeAmount(totalFaces, juzParts.reduce((sum, part) => sum + part.faces, 0))
      || !closeAmount(totalFaces, ranges.reduce((sum, range) => sum + range.faces, 0))) return invalid();
    return { ...pupil(student), ranges, juzParts, totalFaces }; }), row => row.studentId);
  const skippedStudents = unique(rows(row.skippedStudents, raw => { const student = dashboardObject(raw); if (student.reason !== 'no-ranges') return invalid(); return { ...pupil(student), reason: 'no-ranges' as const }; }), row => row.studentId);
  const result: NarrationPreview = { mode: row.mode as NarrationPreview['mode'], scope: row.scope as NarrationPreview['scope'], committeeIds,
    startDate: studentDate(row.startDate), endDate: studentDate(row.endDate), students, skippedStudents };
  if (result.startDate > result.endDate || skippedStudents.some(skipped => students.some(student => student.studentId === skipped.studentId))
    || (result.scope === 'committee' && (!committeeIds.length || [...students, ...skippedStudents].some(student => !committeeIds.includes(student.committeeId ?? 0))))) return invalid();
  if (payload && (result.mode !== payload.mode || result.scope !== payload.scope || result.startDate !== payload.startDate || result.endDate !== payload.endDate
    || JSON.stringify([...committeeIds].sort()) !== JSON.stringify([...payload.committeeIds].sort())
    || (payload.mode === 'manual' && [...students, ...skippedStudents].some(student => !payload.assignments?.some(item => item.studentId === student.studentId))))) return invalid();
  return result;
}
export function decodeNarrationEvents(value: unknown): NarrationEventRow[] { return unique(rows(value, raw => {
  const row = dashboardObject(raw); if (row.status !== 'open' && row.status !== 'archived') return invalid();
  const result: NarrationEventRow = { id: id(row.id), name: text(row.name), startDate: studentDate(row.startDate), endDate: studentDate(row.endDate), status: row.status,
    studentsCount: numeric(row.studentsCount, 0, 100000, true) }; return result.endDate >= result.startDate ? result : invalid();
}), row => row.id); }
function wordMark(value: unknown): NarrationWordMark {
  const row = dashboardObject(value); if (!Object.hasOwn(RECITATION_MARK_LABELS, String(row.markType))) return invalid();
  const startLocation = text(row.startLocation), endLocation = text(row.endLocation);
  if (!/^\d+:\d+:\d+$/.test(startLocation) || !/^\d+:\d+:\d+$/.test(endLocation)) return invalid();
  return { page: numeric(row.page, 1, 604, true), startLocation, endLocation, selectedText: text(row.selectedText, true), notes: text(row.notes, true), markType: row.markType as NarrationWordMark['markType'] };
}
function savedPart(value: unknown): NarrationSavedPart {
  const row = dashboardObject(value); if (row.isFullJuz !== true && row.isFullJuz !== false) return invalid();
  return { ...measuredRange(row), id: id(row.id), juzNumber: numeric(row.juzNumber, 1, 30, true), startSurahName: text(row.startSurahName, true), endSurahName: text(row.endSurahName, true),
    rangeLabel: text(row.rangeLabel), isFullJuz: row.isFullJuz, score: row.score == null ? null : numeric(row.score, 0, 100000), evaluationMode: text(row.evaluationMode, true),
    warningCount: numeric(row.warningCount, 0, 1000, true), hesitationCount: numeric(row.hesitationCount, 0, 1000, true), mistakeCount: numeric(row.mistakeCount, 0, 1000, true),
    wordMarks: rows(row.wordMarks, wordMark, 10000), evaluatorName: text(row.evaluatorName, true), evaluatedAt: text(row.evaluatedAt, true) };
}
export function decodeNarrationEvent(value: unknown, eventId?: number): NarrationEvent {
  const row = dashboardObject(value); const base = decodeNarrationEvents([{ ...row, studentsCount: 0 }])[0]!;
  if (eventId && eventId !== base.id || (row.scope !== 'all' && row.scope !== 'committee')) return invalid();
  const students = unique(rows(row.students, raw => { const student = dashboardObject(raw); if (!Object.hasOwn(narrationStudentLabels, String(student.status))) return invalid();
    return { ...pupil(student), id: id(student.id), status: student.status as NarrationEntry['status'], totalFaces: numeric(student.totalFaces, 0, 604),
      finalScore: student.finalScore == null ? null : numeric(student.finalScore, 0, 100000), finalRating: text(student.finalRating, true), archivedAt: text(student.archivedAt, true),
      parts: unique(rows(student.parts, savedPart), part => part.id), reciterNames: rows(student.reciterNames, item => text(item), 1000) };
  }), student => student.id);
  unique([...students], student => student.studentId); unique(students.flatMap(student => student.parts), part => part.id);
  const policy = dashboardObject(row.evaluationPolicy);
  return { id: base.id, name: base.name, startDate: base.startDate, endDate: base.endDate, status: base.status, scope: row.scope,
    committeeId: optionalId(row.committeeId), createdByName: text(row.createdByName), createdAt: text(row.createdAt), students,
    evaluationPolicy: { maxScore: numeric(policy.maxScore, 0, 100000), warningDeduction: numeric(policy.warningDeduction, 0, 100000),
      hesitationDeduction: numeric(policy.hesitationDeduction, 0, 100000), mistakeDeduction: numeric(policy.mistakeDeduction, 0, 100000) } };
}
export function decodeNarrationPartReference(value: unknown): NarrationPartReference {
  const row = dashboardObject(value); return { ayahs: rows(row.ayahs, raw => { const ayah = dashboardObject(raw); return { surah: numeric(ayah.surah, 1, 114, true),
    ayah: numeric(ayah.ayah, 1, 286, true), textUthmani: text(ayah.textUthmani) }; }, 7000), wordMarks: rows(row.wordMarks, wordMark, 10000) };
}
export const newNarrationDraft = (): NarrationDraft => ({ name: '', startDate: getBusinessDate(), endDate: getBusinessDate(), complexId: 'all', committeeIds: ['all'], mode: 'full', assignments: {} });
export const emptyNarrationRange = (): NarrationRangeDraft => ({ startSurah: '1', startAyah: '', endSurah: '1', endAyah: '' });
const digits = (value: string) => value.replace(/[٠-٩۰-۹]/g, char => String('٠١٢٣٤٥٦٧٨٩'.includes(char) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(char) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
export function normalizeNarrationRange(draft: NarrationRangeDraft, references: NarrationReferences): NarrationRange {
  try { const range = decodeNarrationRange(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, digits(value).trim()])));
    if (!references.chapters.some(chapter => chapter.number === range.startSurah && range.startAyah <= chapter.ayahCount)
      || !references.chapters.some(chapter => chapter.number === range.endSurah && range.endAyah <= chapter.ayahCount)) throw new NativeApiError('validation');
    return range;
  } catch { throw new NativeApiError('validation'); }
}
export function scopedNarrationPupils(draft: NarrationDraft, pupils: readonly NarrationPupil[], circles: readonly ManagedCircle[]): NarrationPupil[] {
  const ids = committeeIdsForScope(draft, [...circles]); return pupils.filter(student => ids.includes('all') || ids.includes(String(student.committeeId)));
}
export function normalizeNarrationDraft(draft: NarrationDraft, pupils: readonly NarrationPupil[], circles: readonly ManagedCircle[], references: NarrationReferences): NarrationPayload {
  const name = draft.name.trim(); let startDate: string, endDate: string;
  try { startDate = studentDate(digits(draft.startDate).trim()); endDate = studentDate(digits(draft.endDate).trim()); } catch { throw new NativeApiError('validation'); }
  const ids = committeeIdsForScope(draft, [...circles]); if (!name || name.length > 180 || startDate > endDate || !ids.length || !['full', 'manual'].includes(draft.mode)) throw new NativeApiError('validation');
  const payload: NarrationPayload = { name, startDate, endDate, scope: ids.includes('all') ? 'all' : 'committee', committeeIds: ids.includes('all') ? [] : ids.map(Number), mode: draft.mode };
  if (draft.mode === 'manual') {
    const scoped = scopedNarrationPupils(draft, pupils, circles);
    payload.assignments = scoped.filter(student => draft.assignments[String(student.studentId)]?.length).map(student => ({ studentId: student.studentId,
      ranges: draft.assignments[String(student.studentId)]!.map(range => normalizeNarrationRange(Object.fromEntries(Object.entries(range).map(([key, value]) => [key, String(value)])) as NarrationRangeDraft, references)) }));
    if (!payload.assignments.length || payload.assignments.some(assignment => assignment.ranges.length > 30)) throw new NativeApiError('validation');
  }
  return payload;
}
export function narrationPreviewFingerprint(preview: NarrationPreview): string {
  const stable = { ...preview, committeeIds: [...preview.committeeIds].sort((a, b) => a - b),
    students: [...preview.students].sort((a, b) => a.studentId - b.studentId), skippedStudents: [...preview.skippedStudents].sort((a, b) => a.studentId - b.studentId) };
  return JSON.stringify(stable);
}
export const narrationEventFingerprint = (event: NarrationEvent) => JSON.stringify(event);
export function narrationEventMatchesPreview(event: NarrationEvent, payload: NarrationPayload, preview: NarrationPreview): boolean {
  return event.name === payload.name && event.startDate === payload.startDate && event.endDate === payload.endDate && event.scope === payload.scope
    && event.students.length === preview.students.length && preview.students.every(expected => {
      const student = event.students.find(row => row.studentId === expected.studentId);
      return !!student && student.committeeId === expected.committeeId && closeAmount(student.totalFaces, expected.totalFaces)
        && student.parts.length === expected.juzParts.length && expected.juzParts.every(part => student.parts.some(saved => saved.juzNumber === part.juz
          && saved.startSurah === part.start.surah && saved.startAyah === part.start.ayah && saved.endSurah === part.end.surah && saved.endAyah === part.end.ayah
          && saved.startPage === part.start.page && saved.endPage === part.end.page && closeAmount(saved.faces, part.faces)));
    });
}
export function narrationRangeLabel(range: NarrationRange, references?: NarrationReferences): string {
  return `من ${references?.chapters.find(row => row.number === range.startSurah)?.name ?? range.startSurah} ${range.startAyah} إلى ${references?.chapters.find(row => row.number === range.endSurah)?.name ?? range.endSurah} ${range.endAyah}`;
}
export const narrationGroups = (entry: NarrationEntry) => groupNarrationParts(entry.parts) as { juzNumber: number; parts: NarrationSavedPart[]; evaluated: boolean; score: number | null; warningCount: number; hesitationCount: number; mistakeCount: number; evaluatorNames: string[] }[];
export const narrationSavedOverall = (entry: NarrationEntry): number | null => narrationOverallScore(narrationGroups(entry));
export function filterNarrationPupils<T extends NarrationPupil>(pupils: readonly T[], search: string): T[] { return filterRosterByName([...pupils], search); }
