import { PASSING_TYPES, PASSING_STATUS_LABELS } from '../../../shared/passing-policy.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { studentDate } from './studentDashboard';
import { NativeApiError } from '../services/nativeApi';

export type PassingType = 'branch' | 'hafiz';
export type PassingStatus = 'pending' | 'in_progress' | 'passed' | 'repeat';
export const passingTypes: Record<PassingType, string> = PASSING_TYPES;
export const passingStatusLabels: Record<PassingStatus, string> = PASSING_STATUS_LABELS;
export interface PassingStudent { id: number; name: string; committeeId: number | null; committeeName: string; complexId: number | null; complexName: string }
export interface PassingRange {
  startPage: number; startSurah: number; startAyah: number; startSurahName: string;
  endPage: number; endSurah: number; endAyah: number; endSurahName: string;
}
export interface PassingEligiblePart { juzNumber: number; ranges: PassingRange[] }
export interface PassingPolicy { maxScore: number; passScore: number; mistakeDeduction: number; warningDeduction: number; hesitationDeduction: number }
export interface PassingResult { score: number; maxScore: number; passed: boolean; reasons: string[]; mistakeCount: number; warningCount: number; hesitationCount: number }
export interface PassingMark { page: number; startLocation: string; endLocation: string; selectedText: string; markType: 'mistake' | 'lahn' | 'warning' | 'hesitation'; notes: string; segmentIndex?: number }
export interface PassingAttempt {
  id: number; partId: number; mode: 'count' | 'mushaf'; result: PassingResult; policy: PassingPolicy; marks: PassingMark[];
  actorName: string; createdAt: string; rehifzDecision: 'pending' | 'keep' | 'repeat'; rehifzId: number | null; rehifzStatus: 'pending' | 'completed' | null;
}
export interface PassingPart extends PassingEligiblePart { id: number; attempts: PassingAttempt[]; latestAttempt: PassingAttempt | null }
export interface PassingExam { id: number; studentId: number; type: PassingType; studentName: string; committeeName: string; createdAt: string; status: PassingStatus; parts: PassingPart[] }
export interface PassingStudentParts { studentId: number; type: PassingType; parts: PassingEligiblePart[]; exams: PassingExam[] }
export interface PassingReportPart extends PassingEligiblePart { attempts: (PassingAttempt & { ranges: PassingRange[] })[] }

const invalid = (): never => { throw new NativeApiError('invalid-response'); };
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function list(value: unknown, max = 20000): unknown[] { return Array.isArray(value) && value.length <= max ? value : invalid(); }
function number(value: unknown, min = 0, max = 1000, integer = false): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value)) ? value : invalid();
}
function id(value: unknown): number { return number(value, 1, Number.MAX_SAFE_INTEGER, true); }
function optionalId(value: unknown): number | null { return value == null ? null : id(value); }
function text(value: unknown, max = 4000, nullable = false): string { return value == null && nullable ? '' : typeof value === 'string' && value.length <= max ? value : invalid(); }
function unique<T>(rows: T[], identity: (value: T) => number): T[] { if (new Set(rows.map(identity)).size !== rows.length) return invalid(); return rows; }
function dateTime(value: unknown): string {
  const date = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(date)) return invalid();
  try { studentDate(date.slice(0, 10)); } catch { return invalid(); } return date;
}
export function validPassingType(value: unknown): value is PassingType { return value === 'branch' || value === 'hafiz'; }
export function decodePassingStudents(value: unknown): PassingStudent[] {
  return unique(list(value).map(raw => { const row = object(raw); return { id: id(row.id), name: text(row.name, 180), committeeId: optionalId(row.committeeId),
    committeeName: text(row.committeeName, 180, true), complexId: optionalId(row.complexId), complexName: text(row.complexName, 180, true) }; }), row => row.id);
}
function range(value: unknown): PassingRange {
  const row = object(value); const result = { startPage: number(row.startPage, 1, 604, true), startSurah: number(row.startSurah, 1, 114, true), startAyah: number(row.startAyah, 1, 286, true),
    startSurahName: text(row.startSurahName, 180, true), endPage: number(row.endPage, 1, 604, true), endSurah: number(row.endSurah, 1, 114, true),
    endAyah: number(row.endAyah, 1, 286, true), endSurahName: text(row.endSurahName, 180, true) };
  if (result.endPage < result.startPage || result.endSurah * 1000 + result.endAyah < result.startSurah * 1000 + result.startAyah) return invalid(); return result;
}
function eligiblePart(value: unknown): PassingEligiblePart {
  const row = object(value); const ranges = list(row.ranges, 114).map(range); if (!ranges.length) return invalid();
  for (let index = 1; index < ranges.length; index++) {
    const previous = ranges[index - 1]!; const current = ranges[index]!;
    if (previous.endSurah * 1000 + previous.endAyah >= current.startSurah * 1000 + current.startAyah) return invalid();
  }
  return { juzNumber: number(row.juzNumber, 1, 30, true), ranges };
}
function policy(value: unknown): PassingPolicy {
  const row = object(value); const result = { maxScore: number(row.maxScore, 1), passScore: number(row.passScore), mistakeDeduction: number(row.mistakeDeduction),
    warningDeduction: number(row.warningDeduction), hesitationDeduction: number(row.hesitationDeduction) };
  if (result.passScore > result.maxScore) return invalid(); return result;
}
function mark(value: unknown, ranges: PassingRange[]): PassingMark {
  const row = object(value); const startLocation = text(row.startLocation, 40); const endLocation = text(row.endLocation, 40);
  const coordinate = (location: string) => {
    if (!/^[1-9]\d{0,2}:[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(location)) return invalid();
    const [surah, ayah] = location.split(':').map(Number); return number(surah, 1, 114, true) * 1000 + number(ayah, 1, 286, true);
  };
  const first = coordinate(startLocation); const last = coordinate(endLocation);
  const segmentIndex = row.segmentIndex == null ? undefined : number(row.segmentIndex, 0, ranges.length - 1, true);
  const allowed = segmentIndex === undefined ? ranges : [ranges[segmentIndex]!];
  if (first > last || !allowed.some(item => first >= item.startSurah * 1000 + item.startAyah && last <= item.endSurah * 1000 + item.endAyah)
    || !['mistake', 'lahn', 'warning', 'hesitation'].includes(String(row.markType))) return invalid();
  return { page: number(row.page, 1, 604, true), startLocation, endLocation, selectedText: text(row.selectedText, 1000),
    markType: row.markType as PassingMark['markType'], notes: text(row.notes, 500, true), ...(segmentIndex === undefined ? {} : { segmentIndex }) };
}
function attempt(value: unknown, partId: number, ranges: PassingRange[]): PassingAttempt {
  const row = object(value); const result = object(row.result); const snapshot = policy(row.policy);
  if (id(row.partId) !== partId || !['count', 'mushaf'].includes(String(row.mode)) || typeof result.passed !== 'boolean'
    || !['pending', 'keep', 'repeat'].includes(String(row.rehifzDecision)) || (row.rehifzStatus != null && !['pending', 'completed'].includes(String(row.rehifzStatus)))) return invalid();
  const maximum = number(result.maxScore, 1); if (maximum !== snapshot.maxScore) return invalid();
  return { id: id(row.id), partId, mode: row.mode as PassingAttempt['mode'], result: { score: number(result.score, 0, maximum), maxScore: maximum,
    passed: result.passed, reasons: list(result.reasons, 100).map(item => text(item, 1000)), mistakeCount: number(result.mistakeCount, 0, 1000, true),
    warningCount: number(result.warningCount, 0, 1000, true), hesitationCount: number(result.hesitationCount, 0, 1000, true) }, policy: snapshot,
    marks: list(row.marks, 20000).map(item => mark(item, ranges)), actorName: text(row.actorName, 160), createdAt: dateTime(row.createdAt),
    rehifzDecision: row.rehifzDecision as PassingAttempt['rehifzDecision'], rehifzId: optionalId(row.rehifzId), rehifzStatus: row.rehifzStatus as PassingAttempt['rehifzStatus'] ?? null };
}
export function decodePassingExam(value: unknown, expectedStudentId?: number, expectedType?: PassingType): PassingExam {
  const row = object(value); const studentId = id(row.studentId); if (!validPassingType(row.type) || (expectedStudentId !== undefined && studentId !== expectedStudentId)
    || (expectedType !== undefined && row.type !== expectedType)) return invalid();
  const parts = unique(list(row.parts, 30).map(raw => {
    const part = object(raw); const eligible = eligiblePart(part); const partId = id(part.id);
    const attempts = unique(list(part.attempts).map(item => attempt(item, partId, eligible.ranges)), item => item.id).sort((a, b) => b.id - a.id);
    const latestAttempt = part.latestAttempt == null ? null : attempt(part.latestAttempt, partId, eligible.ranges);
    if (JSON.stringify(latestAttempt) !== JSON.stringify(attempts[0] ?? null)) return invalid();
    return { ...eligible, id: partId, attempts, latestAttempt };
  }), part => part.juzNumber).sort((a, b) => a.juzNumber - b.juzNumber);
  if (!parts.length || new Set(parts.map(part => part.id)).size !== parts.length || (row.type === 'branch' && parts.length !== 1)) return invalid();
  const status: PassingStatus = parts.every(part => part.latestAttempt?.result.passed) ? 'passed'
    : parts.some(part => part.latestAttempt && !part.latestAttempt.result.passed) ? 'repeat' : parts.some(part => part.latestAttempt) ? 'in_progress' : 'pending';
  if (row.status !== status) return invalid();
  return { id: id(row.id), studentId, type: row.type, studentName: text(row.studentName, 180), committeeName: text(row.committeeName, 180, true),
    createdAt: dateTime(row.createdAt), status, parts };
}
export function decodePassingStudentParts(value: unknown, studentId: number, type: PassingType): PassingStudentParts {
  if (!validPassingType(type)) return invalid(); id(studentId); const row = object(value);
  const parts = unique(list(row.parts, 30).map(eligiblePart), part => part.juzNumber).sort((a, b) => a.juzNumber - b.juzNumber);
  const exams = unique(list(row.exams).map(exam => decodePassingExam(exam, studentId, type)), exam => exam.id).sort((a, b) => b.id - a.id);
  unique(exams.flatMap(exam => exam.parts), part => part.id); unique(exams.flatMap(exam => exam.parts.flatMap(part => part.attempts)), entry => entry.id);
  return { studentId, type, parts, exams };
}
export function passingSnapshot(value: PassingStudentParts): string { return JSON.stringify(value); }
export function canCreatePassingExam(value: PassingStudentParts, juz?: number): boolean {
  if (!value.parts.length || !validPassingType(value.type)) return false;
  if (value.type === 'hafiz') return juz === undefined && !value.exams.some(exam => exam.status !== 'passed'
    || exam.parts.some(part => part.latestAttempt?.rehifzDecision === 'pending'));
  if (!Number.isInteger(juz) || !value.parts.some(part => part.juzNumber === juz)) return false;
  return !value.exams.some(exam => exam.parts.some(part => part.juzNumber === juz
    && (!part.latestAttempt?.result.passed || part.latestAttempt.rehifzDecision === 'pending')));
}
export function passingReportPart(value: PassingStudentParts, juz: number): PassingReportPart | null {
  const parts = value.exams.flatMap(exam => exam.parts.filter(part => part.juzNumber === juz)); const eligible = value.parts.find(part => part.juzNumber === juz);
  if (!parts.length && !eligible) return null;
  return { juzNumber: juz, ranges: parts[0]?.ranges ?? eligible!.ranges,
    attempts: parts.flatMap(part => part.attempts.map(entry => ({ ...entry, ranges: part.ranges }))).sort((a, b) => b.id - a.id) };
}
export function passingRangeLabel(value: PassingRange): string {
  return `${value.startSurahName || `سورة ${value.startSurah}`}، من آية ${value.startAyah} إلى ${value.endSurahName || `سورة ${value.endSurah}`} آية ${value.endAyah} · الصفحات ${value.startPage}–${value.endPage}`;
}
export function filterPassingStudents(rows: PassingStudent[], search: string, complex: string, committee: string): PassingStudent[] {
  return filterRosterByName(rows, search).filter((row: PassingStudent) => (complex === 'all' || String(row.complexId) === complex) && (committee === 'all' || String(row.committeeId) === committee));
}
