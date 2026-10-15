import type { NativeSessionController } from '../domain/nativeSession';
import { hasManagementGrant, normalizeStudentDraft, positiveId, type CircleStudent, type ManagedCircle, type ManagedComplex,
  type ManagedStudent, type StudentDraft } from '../domain/management';
import { NativeApiError } from './nativeApi';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
function text(value: unknown, optional = false): string {
  if (optional && (value === null || value === undefined)) return '';
  if (typeof value !== 'string') throw new NativeApiError('invalid-response');
  return value;
}
function numeric(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) throw new NativeApiError('invalid-response');
  return Number(value);
}
function id(value: unknown, optional = false): number | null {
  if (optional && (value === null || value === undefined)) return null;
  const number = numeric(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new NativeApiError('invalid-response');
  return number;
}
function rows<T>(value: unknown, decode: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value.map(decode);
}
export function decodeManagedStudent(value: unknown): ManagedStudent {
  const row = record(value);
  return { id: id(row.id)!, name: text(row.name), loginNumber: text(row.loginNumber), nationalId: text(row.nationalId, true),
    guardianPhone: text(row.guardianPhone, true), phone: text(row.phone, true), complexId: id(row.complexId, true),
    committeeId: id(row.committeeId, true), committeeName: text(row.committeeName, true), points: numeric(row.points ?? 0) };
}
export function decodeManagedCircle(value: unknown): ManagedCircle {
  const row = record(value);
  return { id: id(row.id)!, name: text(row.name), complexId: id(row.complexId, true), complexName: text(row.complexName, true),
    points: numeric(row.points ?? 0), studentsCount: numeric(row.studentsCount ?? 0) };
}
export function decodeManagedComplex(value: unknown): ManagedComplex {
  const row = record(value);
  return { id: id(row.id)!, name: text(row.name), committeesCount: numeric(row.committeesCount ?? 0) };
}
function ok(value: unknown): void { if (record(value).ok !== true) throw new NativeApiError('invalid-response'); }
export function createManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  function requireGrant(grant: string) {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!hasManagementGrant(identity, grant)) throw new NativeApiError('forbidden');
  }
  async function request<T>(grant: string, path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T): Promise<T> {
    requireGrant(grant); const result = await controller.request(path, options, decode); requireGrant(grant); return result;
  }
  return {
    async loadStudents(signal?: AbortSignal) {
      requireGrant('students');
      const [students, circles] = await Promise.all([
        request('students', '/students?committeeId=all', { signal }, value => rows(value, decodeManagedStudent)),
        request('students', '/committees', { signal }, value => rows(value, decodeManagedCircle)),
      ]);
      return { students, circles };
    },
    async saveStudent(draft: StudentDraft, circles: readonly ManagedCircle[], selected?: ManagedStudent) {
      requireGrant('students'); const payload = normalizeStudentDraft(draft, circles, selected?.points);
      if (selected) return request('students', `/students/${positiveId(selected.id)}`, { method: 'PUT', body: payload }, ok);
      return request('students', '/students', { method: 'POST', body: payload }, decodeManagedStudent);
    },
    async moveStudent(studentId: number, committeeId: number, circles: readonly ManagedCircle[]) {
      requireGrant('students');
      if (!circles.some(circle => circle.id === committeeId)) throw new NativeApiError('validation');
      await request('students', `/students/${positiveId(studentId)}/committee`, { method: 'PATCH', body: { committeeId: positiveId(committeeId) } }, ok);
    },
    async deleteStudent(studentId: number) {
      requireGrant('students'); await request('students', `/students/${positiveId(studentId)}`, { method: 'DELETE' }, ok);
    },
    async loadCircles(signal?: AbortSignal) {
      requireGrant('families');
      const [circles, complexes] = await Promise.all([
        request('families', '/families', { signal }, value => rows(value, decodeManagedCircle)),
        request('families', '/complexes', { signal }, value => rows(value, decodeManagedComplex)),
      ]);
      return { circles, complexes };
    },
    async circleStudents(circleId: number, signal?: AbortSignal): Promise<CircleStudent[]> {
      requireGrant('families');
      return request('families', `/families/${positiveId(circleId)}/students`, { signal }, value => rows(value, item => {
        const row = record(item); return { id: id(row.id)!, name: text(row.name), guardianPhone: text(row.guardianPhone, true) };
      }));
    },
    async saveCircle(name: string, complexId: number, complexes: readonly ManagedComplex[], circleId?: number) {
      requireGrant('families'); const cleanName = name.trim();
      if (!cleanName || !complexes.some(complex => complex.id === complexId)) throw new NativeApiError('validation');
      return request('families', circleId ? `/families/${positiveId(circleId)}` : '/families', {
        method: circleId ? 'PUT' : 'POST', body: { name: cleanName, complexId: positiveId(complexId) },
      }, value => { if (circleId) ok(value); else id(record(value).id); });
    },
    async deleteCircle(circleId: number): Promise<number> {
      requireGrant('families'); return request('families', `/families/${positiveId(circleId)}`, { method: 'DELETE' }, value => {
        ok(value); return numeric(record(value).detachedStudents);
      });
    },
    async saveComplex(name: string, complexId?: number): Promise<void> {
      requireGrant('families'); const cleanName = name.trim();
      if (!cleanName || cleanName.length > 180) throw new NativeApiError('validation');
      await request('families', complexId ? `/complexes/${positiveId(complexId)}` : '/complexes', {
        method: complexId ? 'PUT' : 'POST', body: { name: cleanName },
      }, value => { id(record(value).id); text(record(value).name); });
    },
  };
}
export type ManagementApi = ReturnType<typeof createManagementApi>;
