import { getBusinessDate } from '../../../shared/business-date.js';
import { expectedPlanCompletion } from '../../../src/lib/quranPlanPreview.js';
import { planRangesOverlap } from '../../../shared/quran-plan-queue.js';
import { NativeApiError } from '../services/nativeApi';
import { dashboardObject, decodeStudentRange, studentDate } from './studentDashboard';

export interface PlanRange { startPage: number; endPage: number; startSurah: number; startAyah: number; endSurah: number; endAyah: number }
export type PlanRangeDraft = Record<keyof PlanRange, string>;
export interface PlanChapter { number: number; name: string; startPage: number; endPage: number; ayahs: number }
export interface PlanAyah { ayah: number; page: number }
export interface PlanPause { revision: number; paused: boolean; pausedFrom: string | null; canManage: boolean }
export interface ManagedPlan extends PlanRange {
  id: number; track: 'memorization' | 'mastery'; startDate: string; dailyPages: number; linkPages: number;
  reviewPages: number; reviewHizbs: number; readingHizbs: number | null; progressPercent: number;
  reviewWeekStartDay: number; reviewWeekEndDay: number; reviewMinDailyPages: number;
  projectedEndDate: string | null; queuedRanges: PlanRange[]; priorMemorization: PlanRange[]; completedMemorization: PlanRange[];
}
export interface ManagedPlanStudent { studentId: number; studentName: string; committeeName: string; priorMemorization: PlanRange[]; planPause: PlanPause; plan: ManagedPlan | null }
export interface PlanManagementData {
  rows: ManagedPlanStudent[]; chapters: PlanChapter[]; pause: PlanPause;
  settings: { referenceMode: 'page' | 'ayah'; weeklyHolidayDays: number[]; minimumStartDate: string }; lastStartDate: string;
}
export interface PlanDraft {
  mode: 'continue' | 'new'; track: 'memorization' | 'mastery'; startDate: string; range: PlanRangeDraft;
  dailyPages: string; linkPages: string; reviewHizbs: string; readingHizbs: string;
  priorMemorization: PlanRangeDraft[]; queuedRanges: PlanRangeDraft[];
}
export const emptyPlanRange = (): PlanRangeDraft => ({ startPage: '', endPage: '', startSurah: '', startAyah: '', endSurah: '', endAyah: '' });
export const planRangeDraft = (range: PlanRange): PlanRangeDraft => Object.fromEntries(Object.keys(emptyPlanRange()).map(key => [key, String(range[key as keyof PlanRange] || '')])) as PlanRangeDraft;
const invalid = (): never => { throw new NativeApiError('invalid-response'); };
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, whole = true): number {
  const result = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) ? Number(value) : NaN;
  return Number.isFinite(result) && result >= min && result <= max && (!whole || Number.isSafeInteger(result)) ? result : invalid();
}
function text(value: unknown, optional = false): string { return value == null && optional ? '' : typeof value === 'string' ? value : invalid(); }
function list<T>(value: unknown, decode: (value: unknown) => T): T[] { return Array.isArray(value) && value.length <= 20000 ? value.map(decode) : invalid(); }
export function decodePlanRange(value: unknown): PlanRange {
  const range = decodeStudentRange(value);
  if (range.fromPage === null || range.toPage === null) return invalid();
  return { startPage: range.fromPage, endPage: range.toPage, startSurah: range.fromSurah ?? 0, startAyah: range.fromAyah ?? 0,
    endSurah: range.toSurah ?? 0, endAyah: range.toAyah ?? 0 };
}
export function decodePlanPause(value: unknown): PlanPause {
  const row = dashboardObject(value);
  if (typeof row.paused !== 'boolean' || typeof row.canManage !== 'boolean') return invalid();
  const pausedFrom = row.pausedFrom == null ? null : studentDate(row.pausedFrom);
  if (row.paused !== (pausedFrom !== null)) return invalid();
  return { revision: number(row.revision), paused: row.paused, pausedFrom, canManage: row.canManage };
}
export function decodeManagedPlanStudents(value: unknown): ManagedPlanStudent[] {
  const result = list(value, value => {
    const row = dashboardObject(value); let plan: ManagedPlan | null = null;
    if (row.plan != null) {
      const source = dashboardObject(row.plan);
      if (source.track !== 'memorization' && source.track !== 'mastery') return invalid();
      plan = { ...decodePlanRange(source), id: number(source.id, 1), track: source.track,
        startDate: source.startDate === '' ? '' : studentDate(source.startDate), dailyPages: number(source.dailyPages, 0.25, 604, false),
        linkPages: number(source.linkPages, 1, 604), reviewPages: number(source.reviewPages, 1, 604),
        reviewHizbs: number(source.reviewHizbs, 1, 60), readingHizbs: source.readingHizbs == null ? null : number(source.readingHizbs, 1, 60),
        reviewWeekStartDay: number(source.reviewWeekStartDay ?? 0, 0, 6), reviewWeekEndDay: number(source.reviewWeekEndDay ?? 6, 0, 6),
        reviewMinDailyPages: number(source.reviewMinDailyPages ?? 1, 1, 604),
        progressPercent: number(source.progressPercent, 0, 100, false),
        projectedEndDate: source.projectedEndDate == null ? null : studentDate(source.projectedEndDate),
        queuedRanges: list(source.queuedRanges, decodePlanRange), priorMemorization: list(source.priorMemorization, decodePlanRange),
        completedMemorization: list(source.completedMemorization, decodePlanRange) };
    }
    return { studentId: number(row.studentId, 1), studentName: text(row.studentName), committeeName: text(row.committeeName, true),
      priorMemorization: list(row.priorMemorization, decodePlanRange), planPause: decodePlanPause(row.planPause), plan };
  });
  if (new Set(result.map(row => row.studentId)).size !== result.length) return invalid();
  return result;
}
export function decodePlanChapters(value: unknown): PlanChapter[] {
  return list(value, value => { const row = dashboardObject(value); return { number: number(row.number, 1, 114), name: text(row.name),
    startPage: number(row.startPage, 1, 604), endPage: number(row.endPage, 1, 604), ayahs: number(row.ayahCount, 1, 286) }; });
}
export function decodePlanAyahs(value: unknown): PlanAyah[] {
  return list(value, value => { const row = dashboardObject(value); return { ayah: number(row.ayah, 1, 286), page: number(row.page, 1, 604) }; });
}
export function decodePlanSettings(value: unknown, today = getBusinessDate()): PlanManagementData['settings'] {
  const row = dashboardObject(value); studentDate(today);
  if (row.quranReferenceMode !== 'ayah' && row.quranReferenceMode !== 'page') return invalid();
  const weeklyHolidayDays = list(row.weeklyHolidayDays, value => number(value, 0, 6));
  const term = row.currentTermStartDate ? studentDate(row.currentTermStartDate) : '';
  return { referenceMode: row.quranReferenceMode, weeklyHolidayDays, minimumStartDate: term > today ? term : today };
}
export function initialPlanDraft(row: ManagedPlanStudent, data: PlanManagementData, newPlan = false): PlanDraft {
  const plan = newPlan ? null : row.plan;
  return { mode: plan ? 'continue' : 'new', track: plan?.track ?? 'memorization',
    startDate: plan?.startDate || (data.lastStartDate >= data.settings.minimumStartDate ? data.lastStartDate : data.settings.minimumStartDate),
    range: plan ? planRangeDraft(plan) : emptyPlanRange(), dailyPages: String(plan?.dailyPages ?? 1), linkPages: String(plan?.linkPages ?? 10),
    reviewHizbs: String(plan?.reviewHizbs ?? 1), readingHizbs: String(plan?.readingHizbs ?? 1),
    priorMemorization: [], queuedRanges: plan?.queuedRanges.map(planRangeDraft) ?? [] };
}
export function planNumber(value: string, min: number, max: number, step = 1): number {
  const normalized = value.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replaceAll('٫', '.').trim();
  const result = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  if (!Number.isFinite(result) || result < min || result > max || !Number.isInteger(result / step)) throw new NativeApiError('validation');
  return result;
}
export function normalizePlanRange(draft: PlanRangeDraft, mode: 'page' | 'ayah', chapters: readonly PlanChapter[]): PlanRange {
  const startPage = planNumber(draft.startPage, 1, 604), endPage = planNumber(draft.endPage, 1, 604);
  if (mode === 'page') return { startPage, endPage, startSurah: 0, startAyah: 0, endSurah: 0, endAyah: 0 };
  const startSurah = planNumber(draft.startSurah, 1, 114), endSurah = planNumber(draft.endSurah, 1, 114);
  const first = chapters.find(chapter => chapter.number === startSurah), last = chapters.find(chapter => chapter.number === endSurah);
  if (!first || !last) throw new NativeApiError('validation');
  const startAyah = planNumber(draft.startAyah, 1, first.ayahs), endAyah = planNumber(draft.endAyah, 1, last.ayahs);
  if (startPage < first.startPage || startPage > first.endPage || endPage < last.startPage || endPage > last.endPage) throw new NativeApiError('validation');
  return { startPage, endPage, startSurah, startAyah, endSurah, endAyah };
}
function rangeSegments(range: PlanRange, chapters: readonly PlanChapter[]): PlanRange[] {
  if (!range.startSurah || range.startSurah <= range.endSurah) return [range];
  return chapters.filter(chapter => chapter.number <= range.startSurah && chapter.number >= range.endSurah).map(chapter => ({
    startSurah: chapter.number, endSurah: chapter.number,
    startAyah: chapter.number === range.startSurah ? range.startAyah : 1,
    endAyah: chapter.number === range.endSurah ? range.endAyah : chapter.ayahs,
    startPage: chapter.number === range.startSurah ? range.startPage : chapter.startPage,
    endPage: chapter.number === range.endSurah ? range.endPage : chapter.endPage,
  }));
}
export function planRangeOverlaps(a: PlanRange, b: PlanRange, chapters: readonly PlanChapter[]): boolean {
  return rangeSegments(a, chapters).some(first => rangeSegments(b, chapters).some(second => first.startSurah && second.startSurah
    ? planRangesOverlap(first, second) : Math.min(first.startPage, first.endPage) <= Math.max(second.startPage, second.endPage)
      && Math.min(second.startPage, second.endPage) <= Math.max(first.startPage, first.endPage)));
}
export function normalizeNewPriorRange(draft: PlanRangeDraft, data: PlanManagementData, row: ManagedPlanStudent, staged: readonly PlanRangeDraft[]): PlanRange {
  const range = normalizePlanRange(draft, data.settings.referenceMode, data.chapters);
  if (range.startPage > range.endPage || (range.startSurah && range.startSurah * 1000 + range.startAyah > range.endSurah * 1000 + range.endAyah)
    || [...row.priorMemorization, ...(row.plan?.completedMemorization ?? []), ...staged.map(item => normalizePlanRange(item, data.settings.referenceMode, data.chapters))]
      .some(item => planRangeOverlaps(range, item, data.chapters))) throw new NativeApiError('validation');
  return range;
}
export function previewManagedPlan(draft: PlanDraft, data: PlanManagementData, row: ManagedPlanStudent) {
  const range = normalizePlanRange(draft.range, data.settings.referenceMode, data.chapters);
  const dailyPages = planNumber(draft.dailyPages, 0.25, 604, 0.25);
  const blocked = draft.track === 'mastery' ? [] : [...row.priorMemorization, ...(row.plan?.completedMemorization ?? []),
    ...draft.priorMemorization.map(item => normalizePlanRange(item, data.settings.referenceMode, data.chapters))];
  const pages = new Set<number>();
  for (const segment of rangeSegments(range, data.chapters)) for (let page = Math.min(segment.startPage, segment.endPage); page <= Math.max(segment.startPage, segment.endPage); page++) {
    if (!blocked.some(item => page >= Math.min(item.startPage, item.endPage) && page <= Math.max(item.startPage, item.endPage))) pages.add(page);
  }
  return { pages: pages.size, ...expectedPlanCompletion({ pages: pages.size, dailyPages,
    startDate: draft.startDate > data.settings.minimumStartDate ? draft.startDate : data.settings.minimumStartDate, weeklyHolidayDays: data.settings.weeklyHolidayDays }) };
}
export function normalizePlanDraft(draft: PlanDraft, row: ManagedPlanStudent, data: PlanManagementData) {
  if (!['continue', 'new'].includes(draft.mode) || !['memorization', 'mastery'].includes(draft.track)) throw new NativeApiError('validation');
  try { studentDate(draft.startDate); } catch { throw new NativeApiError('validation'); }
  if ((!row.plan || draft.mode === 'new' || row.plan.startDate >= data.settings.minimumStartDate) && draft.startDate < data.settings.minimumStartDate) throw new NativeApiError('validation');
  const range = normalizePlanRange(draft.range, data.settings.referenceMode, data.chapters);
  const queuedRanges = draft.queuedRanges.map(item => normalizePlanRange(item, data.settings.referenceMode, data.chapters));
  if (queuedRanges.length > 100) throw new NativeApiError('validation');
  const occupied = [range];
  for (const item of queuedRanges) { if (occupied.some(other => planRangeOverlaps(item, other, data.chapters))) throw new NativeApiError('validation'); occupied.push(item); }
  const priorMemorization: PlanRange[] = [];
  for (const item of draft.priorMemorization) priorMemorization.push(normalizeNewPriorRange(item, data, row, priorMemorization.map(planRangeDraft)));
  const preview = previewManagedPlan(draft, data, row);
  if (!preview.pages || preview.error || !preview.endDate) throw new NativeApiError('validation');
  const payloadRange = (item: PlanRange) => data.settings.referenceMode === 'page' ? { startPage: item.startPage, endPage: item.endPage }
    : { startSurah: item.startSurah, startAyah: item.startAyah, endSurah: item.endSurah, endAyah: item.endAyah };
  return { mode: draft.mode, track: draft.track, startDate: draft.startDate, ...payloadRange(range),
    dailyPages: planNumber(draft.dailyPages, 0.25, 604, 0.25), linkPages: planNumber(draft.linkPages, 1, 604),
    reviewPages: row.plan?.reviewPages ?? 20, reviewHizbs: planNumber(draft.reviewHizbs, 1, 60), readingHizbs: planNumber(draft.readingHizbs, 1, 60),
    reviewSplitWeekly: false, reviewWeekStartDay: row.plan?.reviewWeekStartDay ?? 0, reviewWeekEndDay: row.plan?.reviewWeekEndDay ?? 6,
    reviewMinDailyPages: row.plan?.reviewMinDailyPages ?? 1,
    queuedRanges: queuedRanges.map(payloadRange), priorMemorization: priorMemorization.map(payloadRange) };
}
export function planSnapshotKey(row: ManagedPlanStudent): string { return JSON.stringify([row.studentId, row.plan, row.priorMemorization]); }
export function planRangeLabel(range: PlanRange, chapters: readonly PlanChapter[], mode: 'page' | 'ayah'): string {
  return mode === 'page' || !range.startSurah ? `صفحة ${range.startPage} إلى ${range.endPage}`
    : `${chapters.find(item => item.number === range.startSurah)?.name || range.startSurah} ${range.startAyah} إلى ${chapters.find(item => item.number === range.endSurah)?.name || range.endSurah} ${range.endAyah}`;
}
