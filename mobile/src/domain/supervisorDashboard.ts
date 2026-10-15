import { NativeApiError } from '../services/nativeApi';

export type RecitationTaskType = 'memorization' | 'review' | 'link' | 'repeat';
export type RecitationTaskStatus = 'pending' | 'completed' | 'retry';
export type StudentAttendanceStatus = 'present' | 'late' | 'excused' | 'absent';
export type SupervisorStatusFilter = 'all' | RecitationTaskStatus;
export interface SupervisorStudent { readonly id: number; readonly name: string; readonly committeeName: string }
export interface RecitationStudent extends SupervisorStudent {
  readonly attendanceStatus: StudentAttendanceStatus | null;
  readonly canSetAttendance: boolean;
  readonly recitationFinished: boolean;
}
export interface SupervisorTask {
  readonly id: number; readonly studentId: number; readonly taskDate: string;
  readonly taskType: RecitationTaskType; readonly trackLabel: string;
  readonly preview: string; readonly actualPreview: string; readonly pagePreview: string;
  readonly targetPages: number | null;
  readonly teacherCompleted: boolean | null; readonly teacherRatingKey: string | null;
  readonly mistakeCount: number; readonly warningCount: number; readonly hesitationCount: number;
  readonly evaluationScore: number | null; readonly evaluationMaxScore: number | null;
  readonly compensationIndex: number;
}
export interface SupervisorReading {
  readonly studentId: number; readonly status: 'read' | 'missed' | null;
  readonly faces: number; readonly hizbCount: number | null; readonly fromHizb: number | null; readonly toHizb: number | null;
}
export interface SupervisorEvaluation {
  readonly date: string; readonly previousSessionDate: string | null;
  readonly recitationAttendanceSource: 'teacher' | 'supervisor';
  readonly readingOnly: boolean; readonly students: readonly RecitationStudent[];
  readonly tasks: readonly SupervisorTask[]; readonly reading: readonly SupervisorReading[];
}
export interface StaffAttendance {
  readonly enabled: boolean; readonly source: 'teacher' | 'supervisor'; readonly date: string;
  readonly alreadyPresent: boolean; readonly canAttend: boolean; readonly status: StudentAttendanceStatus | null;
  readonly checkInTime: string | null;
  readonly policy: Readonly<{ locationRequired: boolean; latitude: number | null; longitude: number | null; radiusMeters: number }> | null;
}
export interface SupervisorHistoryRow extends SupervisorTask {
  readonly sessionId: string; readonly sessionDate: string; readonly teacherName: string; readonly attemptNumber: number;
}
const attendance = ['present', 'late', 'excused', 'absent'];
export const attendanceLabels: Record<StudentAttendanceStatus, string> = {
  present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب',
};
export const taskLabels: Record<RecitationTaskType, string> = {
  memorization: 'الحفظ', review: 'المراجعة', link: 'الربط', repeat: 'التكرار',
};
export const filterLabels: Record<SupervisorStatusFilter, string> = {
  all: 'كل الحالات', pending: 'لم يقيّم', completed: 'مكتمل', retry: 'يحتاج إعادة',
};
function invalid(): never { throw new NativeApiError('invalid-response'); }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
}
function text(value: unknown, fallback?: string): string {
  if (value == null && fallback !== undefined) return fallback;
  return typeof value === 'string' ? value : invalid();
}
function id(value: unknown): number {
  const number = typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : invalid();
}
function finite(value: unknown, fallback?: number): number {
  if (value == null && fallback !== undefined) return fallback;
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : invalid();
}
function nullableNumber(value: unknown): number | null { return value == null ? null : finite(value); }
function coordinateNumber(value: unknown): number | null {
  if (value == null) return null;
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : invalid();
}
function boolean(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function status(value: unknown): StudentAttendanceStatus | null {
  if (value == null || value === '') return null;
  return attendance.includes(String(value)) ? value as StudentAttendanceStatus : invalid();
}
export function validSupervisorDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function date(value: unknown): string { return validSupervisorDate(value) ? value : invalid(); }
function parseTask(value: unknown, historical = false): SupervisorTask {
  const row = record(value);
  if (!['memorization', 'review', 'link', 'repeat'].includes(String(row.taskType))) invalid();
  const completed = row.teacherCompleted;
  if (completed !== null && typeof completed !== 'boolean') invalid();
  return Object.freeze({ id: id(historical ? row.taskId : row.id), studentId: id(row.studentId),
    taskDate: date(row.taskDate), taskType: row.taskType as RecitationTaskType,
    trackLabel: text(row.trackLabel, ''), preview: text(row.preview ?? row.ayahPreview, ''),
    actualPreview: text(row.actualPreview, ''), pagePreview: text(row.pagePreview, ''),
    targetPages: nullableNumber(row.targetPages), teacherCompleted: completed,
    teacherRatingKey: row.teacherRatingKey == null ? null : text(row.teacherRatingKey),
    mistakeCount: finite(row.mistakeCount, 0), warningCount: finite(row.warningCount, 0), hesitationCount: finite(row.hesitationCount, 0),
    evaluationScore: nullableNumber(row.evaluationScore), evaluationMaxScore: nullableNumber(row.evaluationMaxScore),
    compensationIndex: finite(row.compensationIndex, 0) });
}
export function decodeSupervisorRoster(value: unknown): readonly SupervisorStudent[] {
  const seen = new Set<number>();
  return Object.freeze(array(value).map(item => {
    const row = record(item); const studentId = id(row.id);
    if (seen.has(studentId)) invalid(); seen.add(studentId);
    // Login numbers and other personal fields returned by the report are not retained.
    return Object.freeze({ id: studentId, name: text(row.name), committeeName: text(row.committeeName, '') });
  }));
}
export function decodeSupervisorEvaluation(value: unknown): SupervisorEvaluation {
  const body = record(value);
  if (!['teacher', 'supervisor'].includes(String(body.recitationAttendanceSource))) invalid();
  const seen = new Set<number>();
  const students = array(body.students).map(item => {
    const row = record(item); const studentId = id(row.studentId);
    if (seen.has(studentId)) invalid(); seen.add(studentId);
    return Object.freeze({ id: studentId, name: text(row.studentName), committeeName: text(row.committeeName, ''),
      attendanceStatus: status(row.attendanceStatus), canSetAttendance: boolean(row.canSetAttendance),
      recitationFinished: row.recitationFinished === undefined ? false : boolean(row.recitationFinished) });
  });
  const taskIds = new Set<number>();
  const tasks = array(body.tasks).map(item => {
    const task = parseTask(item);
    if (!seen.has(task.studentId) || taskIds.has(task.id)) invalid(); taskIds.add(task.id); return task;
  });
  const readingIds = new Set<number>();
  const reading = array(body.reading ?? []).map(item => {
    const row = record(item);
    const studentId = id(row.studentId); if (!seen.has(studentId) || readingIds.has(studentId)) invalid();
    readingIds.add(studentId);
    if (row.status !== null && row.status !== 'read' && row.status !== 'missed') invalid();
    const amount = row.amount == null ? null : record(row.amount);
    return Object.freeze({ studentId, status: row.status,
      faces: finite(row.recordedFaces ?? amount?.faces ?? row.faces), hizbCount: nullableNumber(row.hizbCount ?? amount?.hizbCount),
      fromHizb: nullableNumber(row.fromHizb ?? amount?.fromHizb), toHizb: nullableNumber(row.toHizb ?? amount?.toHizb) });
  });
  return Object.freeze({ date: date(body.date), previousSessionDate: body.previousSessionDate ? date(body.previousSessionDate) : null,
    recitationAttendanceSource: body.recitationAttendanceSource as SupervisorEvaluation['recitationAttendanceSource'],
    readingOnly: body.readingOnly === undefined ? false : boolean(body.readingOnly),
    students: Object.freeze(students), tasks: Object.freeze(tasks), reading: Object.freeze(reading) });
}
export function decodeStaffAttendance(value: unknown): StaffAttendance {
  const row = record(value);
  if (!['teacher', 'supervisor'].includes(String(row.source))) invalid();
  const enabled = boolean(row.enabled); const alreadyPresent = boolean(row.alreadyPresent); const canAttend = boolean(row.canAttend);
  if (enabled !== (row.source === 'teacher') || canAttend && (!enabled || alreadyPresent)) invalid();
  let policy: StaffAttendance['policy'] = null;
  if (row.offlinePolicy != null) {
    const item = record(row.offlinePolicy); const locationRequired = boolean(item.locationRequired);
    const latitude = coordinateNumber(item.targetLatitude);
    const longitude = coordinateNumber(item.targetLongitude);
    if (locationRequired && (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) invalid();
    const radiusMeters = finite(item.radiusMeters); if (radiusMeters <= 0) invalid();
    policy = Object.freeze({ locationRequired, latitude, longitude, radiusMeters });
  }
  if (enabled && !policy) invalid();
  return Object.freeze({ enabled, source: row.source as StaffAttendance['source'], date: date(row.date), alreadyPresent, canAttend,
    status: status(row.status), checkInTime: row.checkInTime == null ? null : text(row.checkInTime), policy });
}
export function decodeSupervisorHistory(value: unknown, studentId: number): readonly SupervisorHistoryRow[] {
  return Object.freeze(array(record(value).rows).map(item => {
    const row = record(item); const task = parseTask(row, true);
    if (task.studentId !== studentId) invalid();
    const sessionId = text(row.sessionId); if (!sessionId) invalid();
    return Object.freeze({ ...task, sessionId, sessionDate: date(row.sessionDate), teacherName: text(row.teacherName, 'مشرف المسار'),
      attemptNumber: id(row.attemptNumber) });
  }).sort((first, second) => second.sessionDate.localeCompare(first.sessionDate)));
}
export function supervisorTaskStatus(task: SupervisorTask): RecitationTaskStatus {
  if (task.teacherCompleted === true) return 'completed';
  if (task.teacherCompleted === false || task.teacherRatingKey === 'repeat_required') return 'retry';
  return 'pending';
}
export function supervisorTaskStatusLabel(task: SupervisorTask): string {
  if (supervisorTaskStatus(task) !== 'completed') return filterLabels[supervisorTaskStatus(task)];
  return task.mistakeCount + task.warningCount + task.hesitationCount === 0 ? 'متقن' : 'اجتاز';
}
export function supervisorTaskAmount(task: SupervisorTask): string {
  return task.actualPreview || task.preview || task.pagePreview || 'لم يحدد مقدار لهذه المهمة.';
}
export function supervisorReadingAmount(reading: SupervisorReading): string {
  const amount = reading.hizbCount === null ? `${reading.faces} وجه` : `${reading.hizbCount} حزب`;
  return reading.fromHizb !== null && reading.toHizb !== null ? `${amount}؛ من الحزب ${reading.fromHizb} إلى ${reading.toHizb}` : amount;
}
function searchText(value: string): string {
  return value.normalize('NFKC').replace(/\u0640|[\u064b-\u065f]|\u0670/g, '').replace(/(?:\u0623|\u0625|\u0622)/g, 'ا').trim().toLowerCase();
}
export function filterSupervisorStudents(evaluation: SupervisorEvaluation, query: string, filter: SupervisorStatusFilter): readonly RecitationStudent[] {
  const search = searchText(query);
  return evaluation.students.filter(student => {
    if (search && !searchText(`${student.name} ${student.committeeName}`).includes(search)) return false;
    if (filter === 'all') return true;
    // Completed same-day attempts can be omitted from tasks; the server retains their session state.
    if (filter === 'completed' && student.recitationFinished) return true;
    if (evaluation.tasks.some(task => task.studentId === student.id && supervisorTaskStatus(task) === filter)) return true;
    return evaluation.reading.some(reading => reading.studentId === student.id
      && (reading.status === 'read' ? 'completed' : reading.status === 'missed' ? 'retry' : 'pending') === filter);
  });
}
export function canSetStudentAttendance(evaluation: SupervisorEvaluation, studentId: number): boolean {
  return evaluation.recitationAttendanceSource === 'teacher' && evaluation.students.some(student => student.id === studentId && student.canSetAttendance);
}
