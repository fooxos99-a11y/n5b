import { canStudentExecuteQuranTask } from '../../../shared/quran-execution-policy.js';
import { shiftDateOnly } from '../../../shared/business-date.js';
import { formatQuranRangeText } from '../../../src/lib/quranRangeText.js';
import { studentSessionResult, studentSessionGroupResult } from '../../../src/lib/studentSessionResult.js';
import { NativeApiError } from '../services/nativeApi';

export type StudentTaskType = 'memorization' | 'review' | 'link' | 'repeat';
export const studentTaskLabels: Record<StudentTaskType, string> = { memorization: 'الحفظ', review: 'المراجعة', link: 'الربط', repeat: 'التكرار' };
export interface StudentRange {
  fromPage: number | null; toPage: number | null; fromSurah: number | null; fromAyah: number | null;
  toSurah: number | null; toAyah: number | null; fromSurahName: string; toSurahName: string;
}
export interface StudentTask {
  id: number; planId: number; studentId: number; taskDate: string; sessionDate: string;
  taskType: StudentTaskType; track: string; amountHidden: boolean; range: StudentRange | null; amount: string;
  teacherCompleted: boolean | null; studentStatus: string; executionActorRole: string;
  mistakeCount: number; warningCount: number; hesitationCount: number;
  evaluationScore: number | null; evaluationMaxScore: number | null;
  actualRepeatCount: number; actualListeningCount: number; repeatCount: number | null; listeningCount: number | null;
  teacherName: string; evaluatedAt: string;
}
export type StudentPreviewTask = Pick<StudentTask, 'taskType' | 'track' | 'amountHidden' | 'range' | 'amount'> & { id: string };
export interface StudentToday {
  date: string; tasks: StudentTask[]; amounts: StudentTask[]; nextDay: { date: string; tasks: StudentPreviewTask[] } | null;
  plan: { track: string; progressPercent: number; projectedEndDate: string | null; delayedFaces: number; paceStatus: string } | null;
  isPlanPaused: boolean; isSeasonalHoliday: boolean; isHoliday: boolean;
  executionSources: Partial<Record<StudentTaskType, 'student' | 'teacher' | 'both'>>;
  hiddenAmounts: Partial<Record<StudentTaskType, boolean>>;
}
export interface StudentPointsDay {
  date: string; earned: number; additionalEarned: number; pending: boolean;
  details: { label: string; earned: number }[]; additionalDetails: { label: string; earned: number }[];
}
export interface StudentGrade { grade: number; max: number; recorded: boolean }
export interface StudentDailyRecord extends StudentGrade {
  passed: boolean; status: string; readingAmount: string; ranges: StudentRange[];
}
export interface StudentWeeklyGrade {
  weekStart: string; weekEnd: string; total: number; max: number;
  weeklyProgram: StudentGrade; trackSession: StudentGrade; weeklySession: StudentGrade;
  trackDay: number; weeklyDay: number; trackAttendance: string; weeklyAttendance: string;
  trackSegments: { source: string; range: StudentRange | null; compensated: boolean; recorded: boolean;
    grade: number; max: number; mistakes: number; warnings: number; hesitations: number }[];
  records: Record<string, Partial<Record<'attendance' | 'reading', StudentDailyRecord>>>;
  scheduledRecords: Record<string, { attendance: boolean; reading: boolean }>;
}
export interface StudentOverview {
  rows: StudentTask[]; points: { total: number; days: StudentPointsDay[] }; weeklyGrades: StudentWeeklyGrade[];
}
export interface StudentLevel { key: string; name: string; progressPercent: number; finished: boolean; since: string; days: number }
export interface StudentSavedJuz { juz: number; label: string; progressPercent: number; isComplete: boolean; savedRanges: StudentRange[] }
export interface StudentNewsEntry { id: string; title: string; body: string; image: string; textColor: string }
export interface StudentPlanData { today: StudentToday; overview: StudentOverview }
export interface StudentWeek { start: string; end: string; days: { date: string; tasks: StudentTask[]; points?: StudentPointsDay }[]; grade?: StudentWeeklyGrade }

const invalid = (): never => { throw new NativeApiError('invalid-response'); };
export function dashboardObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
}
function list(value: unknown, max = 20000): unknown[] {
  return Array.isArray(value) && value.length <= max ? value : invalid();
}
function text(value: unknown, fallback = '', max = 4000): string {
  if (value == null) return fallback;
  return typeof value === 'string' && value.length <= max ? value : invalid();
}
function number(value: unknown, min = -1e12, max = 1e12): number {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value))) return invalid();
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : invalid();
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, min, max);
  return Number.isSafeInteger(result) ? result : invalid();
}
function nullableNumber(value: unknown, min = 0, max = 1e12): number | null { return value == null ? null : number(value, min, max); }
function flag(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return invalid();
}
export function studentDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : invalid();
}
function optionalDate(value: unknown): string | null { return value == null || value === '' ? null : studentDate(value); }
function coordinate(value: unknown, max: number): number | null { return value == null ? null : integer(value, 1, max); }
export function decodeStudentRange(body: unknown): StudentRange {
  const value = dashboardObject(body);
  const range: StudentRange = {
    fromPage: coordinate(value.fromPage ?? value.startPage, 604), toPage: coordinate(value.toPage ?? value.endPage, 604),
    fromSurah: coordinate(value.fromSurah ?? value.startSurah, 114), toSurah: coordinate(value.toSurah ?? value.endSurah, 114),
    fromAyah: coordinate(value.fromAyah ?? value.startAyah, 286), toAyah: coordinate(value.toAyah ?? value.endAyah, 286),
    fromSurahName: text(value.fromSurahName ?? value.startSurahName, '', 100), toSurahName: text(value.toSurahName ?? value.endSurahName, '', 100),
  };
  const positions = [range.fromSurah, range.fromAyah, range.toSurah, range.toAyah];
  if (positions.some(value => value !== null) && positions.some(value => value === null)) return invalid();
  if ((range.fromPage === null) !== (range.toPage === null)) return invalid();
  if (positions.every(value => value === null) && range.fromPage === null) return invalid();
  return range;
}
export function studentRangeLabel(range: StudentRange): string {
  return formatQuranRangeText({ startPage: range.fromPage, endPage: range.toPage, startSurah: range.fromSurah,
    startAyah: range.fromAyah, endSurah: range.toSurah, endAyah: range.toAyah,
    startSurahName: range.fromSurahName, endSurahName: range.toSurahName });
}
function taskAmount(value: Record<string, unknown>) {
  const type = text(value.taskType);
  if (!['memorization', 'review', 'link', 'repeat'].includes(type)) return invalid();
  const hidden = flag(value.amountHidden);
  // Hidden amounts must never be reconstructed from stale or unexpected response fields.
  const range = hidden || [value.fromPage, value.fromSurah].every(part => part == null) ? null : decodeStudentRange(value);
  const preview = hidden ? '' : (value.reviewExecution ? text(value.actualPreview) : '') || text(value.ayahPreview) || text(value.preview);
  return { taskType: type as StudentTaskType, track: text(value.track), amountHidden: hidden, range,
    amount: hidden ? '' : preview || (range ? studentRangeLabel(range) : '') };
}
function parseTask(body: unknown, studentId: number): StudentTask {
  const value = dashboardObject(body);
  if (integer(value.studentId, 1) !== studentId) return invalid();
  return { id: integer(value.id, 1), planId: integer(value.planId, 1), studentId,
    taskDate: studentDate(value.taskDate), sessionDate: studentDate(value.sessionDate ?? value.taskDate), ...taskAmount(value),
    teacherCompleted: value.teacherCompleted == null ? null : flag(value.teacherCompleted),
    studentStatus: text(value.studentStatus), executionActorRole: text(value.executionActorRole),
    mistakeCount: integer(value.mistakeCount ?? 0, 0), warningCount: integer(value.warningCount ?? 0, 0), hesitationCount: integer(value.hesitationCount ?? 0, 0),
    evaluationScore: nullableNumber(value.evaluationScore, -1e12), evaluationMaxScore: nullableNumber(value.evaluationMaxScore),
    actualRepeatCount: integer(value.actualRepeatCount ?? 0, 0), actualListeningCount: integer(value.actualListeningCount ?? 0, 0),
    repeatCount: nullableNumber(value.repeatCount), listeningCount: nullableNumber(value.listeningCount),
    teacherName: text(value.teacherName), evaluatedAt: text(value.evaluatedAt, '', 40) };
}
export function decodeStudentToday(body: unknown, studentId: number): StudentToday {
  const value = dashboardObject(body);
  const date = studentDate(value.date);
  const plan = value.plan == null ? null : dashboardObject(value.plan);
  if (plan?.studentId != null && integer(plan.studentId, 1) !== studentId) return invalid();
  const sources = value.executionSources == null ? {} : dashboardObject(value.executionSources);
  const executionSources: StudentToday['executionSources'] = {};
  for (const type of ['memorization', 'review', 'link', 'repeat'] as const) {
    if (sources[type] == null) continue;
    if (!['student', 'teacher', 'both'].includes(String(sources[type]))) return invalid();
    executionSources[type] = sources[type] as 'student' | 'teacher' | 'both';
  }
  const tasks = list(value.tasks).map(row => parseTask(row, studentId));
  const amounts = list(value.todayAmounts ?? value.tasks).map(row => parseTask(row, studentId));
  if ([...tasks, ...amounts].some(task => task.taskDate !== date)) return invalid();
  const next = value.nextDay == null ? null : dashboardObject(value.nextDay);
  const nextDate = next ? studentDate(next.date) : null;
  if (nextDate && nextDate !== shiftDateOnly(date, 1)) return invalid();
  const nextTasks = next ? list(next.tasks).map(raw => {
    const value = dashboardObject(raw);
    if (value.studentId != null && integer(value.studentId, 1) !== studentId) return invalid();
    if (value.taskDate != null && studentDate(value.taskDate) !== nextDate) return invalid();
    const id = typeof value.id === 'string' && /^preview-(memorization|review|link)-\d+$/.test(value.id) ? value.id : String(integer(value.id, 1));
    return { id, ...taskAmount(value) };
  }) : [];
  const hiddenAmounts: StudentToday['hiddenAmounts'] = {};
  for (const [type, key] of [['memorization', 'hideStudentMemorizationAmount'], ['review', 'hideStudentReviewAmount'], ['link', 'hideStudentLinkAmount']] as const) {
    hiddenAmounts[type] = flag(value[key]);
  }
  return { date, tasks, amounts, nextDay: next && nextDate ? { date: nextDate, tasks: nextTasks } : null,
    plan: plan ? { track: text(plan.track), progressPercent: number(plan.progressPercent ?? dashboardObject(plan.progress ?? {}).progressPercent ?? 0, 0, 100),
      projectedEndDate: optionalDate(plan.projectedEndDate), delayedFaces: number(plan.delayedFaces ?? 0, 0), paceStatus: text(plan.paceStatus) } : null,
    isPlanPaused: flag(value.isPlanPaused), isSeasonalHoliday: flag(value.isSeasonalHoliday), isHoliday: flag(value.isHoliday), executionSources, hiddenAmounts };
}
function grade(value: unknown): StudentGrade {
  const record = dashboardObject(value);
  return { grade: number(record.grade), max: number(record.max, 0), recorded: flag(record.recorded, true) };
}
const attendanceValues = new Set(['present', 'late', 'excused', 'absent']);
function attendance(value: Record<string, unknown>): string {
  if (value.attendanceRecorded === false) return '';
  if (typeof value.attendanceStatus === 'string' && attendanceValues.has(value.attendanceStatus)) return value.attendanceStatus;
  return value.attended === true ? 'present' : value.attended === false ? 'absent' : '';
}
function parseWeeklyGrade(body: unknown, studentId: number): StudentWeeklyGrade {
  const value = dashboardObject(body);
  if (value.studentId != null && integer(value.studentId, 1) !== studentId) return invalid();
  const weekStart = studentDate(value.weekStart); const weekEnd = studentDate(value.weekEnd);
  if (weekEnd !== shiftDateOnly(weekStart, 6)) return invalid();
  const policy = dashboardObject(value.policy ?? {});
  const trackDetail = dashboardObject(value.trackDetail ?? {}); const weeklyDetail = dashboardObject(value.weeklyDetail ?? {});
  const records: StudentWeeklyGrade['records'] = {};
  const scheduledRecords: StudentWeeklyGrade['scheduledRecords'] = {};
  for (const raw of list(value.days ?? [], 7)) {
    const day = dashboardObject(raw); const date = studentDate(day.date);
    if (date < weekStart || date > weekEnd) return invalid();
    const components = dashboardObject(day.components ?? {});
    if (!flag(day.excluded)) scheduledRecords[date] = { attendance: components.attendance != null, reading: components.reading != null };
  }
  for (const [date, raw] of Object.entries(dashboardObject(value.records ?? {}))) {
    studentDate(date); if (date < weekStart || date > weekEnd) return invalid();
    const day = dashboardObject(raw); records[date] = {};
    for (const component of ['attendance', 'reading'] as const) {
      if (day[component] == null) continue;
      const record = dashboardObject(day[component]); const detail = dashboardObject(record.detail ?? {});
      const ranges = detail.ranges ?? (detail.range ? [detail.range] : []);
      const hizbs = nullableNumber(detail.hizbCount); const faces = nullableNumber(detail.requiredFaces);
      records[date][component] = { ...grade(record), passed: flag(record.passed), status: text(detail.status),
        readingAmount: hizbs ? `${hizbs} أحزاب` : faces ? `${faces} أوجه` : '', ranges: list(ranges, 100).map(decodeStudentRange) };
    }
  }
  return { weekStart, weekEnd, total: number(value.total), max: number(value.max, 0),
    weeklyProgram: grade(value.weeklyProgram), trackSession: grade(value.trackSession), weeklySession: grade(value.weeklySession),
    trackDay: integer(dashboardObject(policy.trackSession ?? {}).sessionDay ?? 0, 0, 6),
    weeklyDay: integer(dashboardObject(policy.weeklySession ?? {}).sessionDay ?? 0, 0, 6),
    trackAttendance: attendance(trackDetail), weeklyAttendance: attendance(weeklyDetail), records, scheduledRecords,
    trackSegments: list(trackDetail.segments ?? [], 100).map(raw => {
      const segment = dashboardObject(raw);
      return { source: text(segment.source), range: segment.amountHidden === true || segment.range == null ? null : decodeStudentRange(segment.range),
        compensated: flag(segment.compensated), recorded: flag(segment.recorded), grade: number(segment.grade ?? 0), max: number(segment.max ?? 0, 0),
        mistakes: integer(segment.mistakes ?? 0, 0), warnings: integer(segment.warnings ?? 0, 0), hesitations: integer(segment.hesitations ?? 0, 0) };
    }) };
}
export function decodeStudentOverview(body: unknown, studentId: number): StudentOverview {
  const value = dashboardObject(body); const points = dashboardObject(value.points);
  const detail = (raw: unknown) => { const item = dashboardObject(raw); return { label: text(item.label), earned: number(item.earned) }; };
  return { rows: list(value.rows).map(row => parseTask(row, studentId)), points: { total: number(points.total),
    days: list(points.days).map(raw => { const day = dashboardObject(raw); return { date: studentDate(day.date),
      earned: number(day.earned), additionalEarned: number(day.additionalEarned), pending: flag(day.pending),
      details: list(day.details).map(detail), additionalDetails: list(day.additionalDetails).map(detail) }; }) },
    weeklyGrades: list(value.weeklyGrades).map(raw => parseWeeklyGrade(raw, studentId)) };
}
export function decodeStudentLevel(body: unknown): StudentLevel {
  const value = dashboardObject(body);
  return { key: text(value.key), name: text(value.name), progressPercent: number(value.progressPercent, 0, 100),
    finished: flag(value.finished), since: studentDate(value.since), days: integer(value.days, 0) };
}
export function decodeStudentSaved(body: unknown): StudentSavedJuz[] {
  return list(body, 30).map(raw => { const value = dashboardObject(raw); return { juz: integer(value.juz, 1, 30),
    label: text(value.label), progressPercent: number(value.progressPercent, 0, 100), isComplete: flag(value.isComplete),
    savedRanges: list(value.savedRanges, 1000).map(decodeStudentRange) }; });
}
export function decodeStudentNews(body: unknown): StudentNewsEntry[] {
  return list(dashboardObject(body).entries, 8).map(raw => {
    const value = dashboardObject(raw); const image = text(value.image, '', 7_000_000);
    if (image && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return invalid();
    const textColor = text(value.textColor, '#000000', 7);
    if (!/^#[\da-f]{6}$/i.test(textColor)) return invalid();
    return { id: text(value.id, '', 80), title: text(value.title, '', 80), body: text(value.body, '', 2000), image, textColor };
  });
}
export function studentTodayGroups(today: StudentToday) {
  const groups = (['memorization', 'review', 'link'] as const).flatMap(type => {
    const tasks = today.amounts.filter(task => task.taskType === type);
    return tasks.length ? [{ type, label: type === 'memorization' && today.plan?.track === 'mastery' ? 'الإتقان' : studentTaskLabels[type],
      tasks, complete: tasks.every(task => task.teacherCompleted === true) }] : [];
  });
  return { groups, percent: groups.length ? Math.floor(groups.filter(group => group.complete).length / groups.length * 100) : 0 };
}
export function studentTaskResult(tasks: StudentTask[]): string {
  if (!tasks.length) return 'بانتظار التقييم';
  return tasks.length === 1 ? studentSessionResult(tasks[0]).label : studentSessionGroupResult(tasks).label;
}
export function studentExecutionEligible(today: StudentToday, type: StudentTaskType): boolean {
  // The shared policy is authoritative even when a legacy server snapshot says student/both.
  return canStudentExecuteQuranTask(today.executionSources, type) && !today.isPlanPaused && !today.isSeasonalHoliday
    && today.tasks.some(task => task.taskType === type && task.teacherCompleted === null && task.executionActorRole !== 'teacher');
}
export function studentPlanWeeks(data: StudentPlanData): StudentWeek[] {
  const days = new Map<string, StudentWeek['days'][number]>(); const tasks = new Map<string, StudentTask>();
  for (const task of [...data.today.amounts, ...data.overview.rows]) {
    if (task.taskDate <= data.today.date && task.taskType !== 'repeat') tasks.set(`${task.taskDate}:${task.id}`, task);
  }
  const day = (date: string) => { if (!days.has(date)) days.set(date, { date, tasks: [] }); return days.get(date)!; };
  day(data.today.date);
  for (const task of tasks.values()) {
    const hiddenKey = data.today.hiddenAmounts[task.taskType] || data.today.amounts.some(row => row.taskType === task.taskType && row.amountHidden);
    day(task.taskDate).tasks.push(hiddenKey ? { ...task, amountHidden: true, amount: '', range: null } : task);
  }
  for (const points of data.overview.points.days) if (points.date <= data.today.date) day(points.date).points = points;
  const weeks = new Map<string, StudentWeek>();
  const week = (start: string) => { if (!weeks.has(start)) weeks.set(start, { start, end: shiftDateOnly(start, 6), days: [] }); return weeks.get(start)!; };
  for (const value of days.values()) {
    const start = shiftDateOnly(value.date, -new Date(`${value.date}T12:00:00Z`).getUTCDay()); week(start).days.push(value);
  }
  for (const grade of data.overview.weeklyGrades) if (grade.weekStart <= data.today.date) {
    const current = week(grade.weekStart); current.grade = grade;
    for (const date of Object.keys(grade.records)) if (date <= data.today.date && !current.days.some(day => day.date === date)) current.days.push({ date, tasks: [] });
  }
  for (const value of weeks.values()) value.days.sort((a, b) => b.date.localeCompare(a.date));
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start));
}
export function studentDashboardError(error: unknown, fallback: string): string {
  return error instanceof NativeApiError ? error.message : fallback;
}
