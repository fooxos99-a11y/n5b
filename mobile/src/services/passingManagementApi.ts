import { canCreatePassingExam, decodePassingExam, decodePassingStudentParts, decodePassingStudents, passingSnapshot, validPassingType,
  type PassingExam, type PassingStudentParts, type PassingType } from '../domain/passingManagement';
import { hasManagementGrant, positiveId } from '../domain/management';
import type { NativeSessionController } from '../domain/nativeSession';
import { NativeApiError } from './nativeApi';

export function createPassingManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  function assertContext() {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!hasManagementGrant(identity, 'quranPassing')) throw new NativeApiError('forbidden');
  }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T) {
    assertContext(); const value = await controller.request(path, options, decode); assertContext(); return value;
  }
  async function parts(studentId: number, type: PassingType, signal?: AbortSignal): Promise<PassingStudentParts> {
    assertContext(); positiveId(studentId); if (!validPassingType(type)) throw new NativeApiError('validation');
    return request(`/passing/students/${studentId}/parts?type=${type}`, { signal }, value => decodePassingStudentParts(value, studentId, type));
  }
  return {
    students: (signal?: AbortSignal) => request('/passing/students', { signal }, decodePassingStudents),
    parts,
    async create(snapshot: PassingStudentParts, juz?: number): Promise<PassingExam> {
      assertContext(); positiveId(snapshot.studentId);
      if (!canCreatePassingExam(snapshot, juz)) throw new NativeApiError('validation');
      const current = await parts(snapshot.studentId, snapshot.type);
      if (passingSnapshot(current) !== passingSnapshot(snapshot)) throw new NativeApiError('conflict', 409);
      return request('/passing', { method: 'POST', body: { studentId: snapshot.studentId, type: snapshot.type,
        ...(snapshot.type === 'branch' ? { juz } : {}) } }, value => {
        const exam = decodePassingExam(value, snapshot.studentId, snapshot.type);
        const expectedParts = snapshot.type === 'branch' ? current.parts.filter(part => part.juzNumber === juz) : current.parts;
        if (exam.status !== 'pending' || exam.parts.some(part => part.attempts.length)
          || JSON.stringify(exam.parts.map(part => ({ juzNumber: part.juzNumber, ranges: part.ranges }))) !== JSON.stringify(expectedParts))
          throw new NativeApiError('invalid-response');
        return exam;
      });
    },
  };
}
export type PassingManagementApi = ReturnType<typeof createPassingManagementApi>;
