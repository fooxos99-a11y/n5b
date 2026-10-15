import type { NativeSessionController } from '../domain/nativeSession';
import { decodeStudentLevel, decodeStudentNews, decodeStudentOverview, decodeStudentSaved, decodeStudentToday,
  type StudentLevel, type StudentNewsEntry, type StudentPlanData, type StudentSavedJuz } from '../domain/studentDashboard';
import { NativeApiError } from './nativeApi';

export interface StudentDashboardApi {
  loadPlan(options?: { signal?: AbortSignal }): Promise<StudentPlanData>;
  loadLevel(options?: { signal?: AbortSignal }): Promise<StudentLevel>;
  loadSaved(options?: { signal?: AbortSignal }): Promise<StudentSavedJuz[]>;
  loadNews(options?: { signal?: AbortSignal }): Promise<StudentNewsEntry[]>;
}

/** Bound to a trusted student session; no method accepts an arbitrary student or tenant ID. */
export function createStudentDashboardApi(controller: NativeSessionController): StudentDashboardApi {
  const initial = controller.getSnapshot(); const identity = initial.session;
  if (initial.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
  if (identity.role !== 'student') throw new NativeApiError('forbidden');
  const studentId = identity.id; const registrationNumber = identity.complex.registrationNumber;
  function assertSession() {
    const current = controller.getSnapshot(); const session = current.session;
    if (current.status !== 'authenticated' || !session) throw new NativeApiError('unauthorized');
    if (session.role !== 'student' || session.id !== studentId
      || session.complex.registrationNumber !== registrationNumber) throw new NativeApiError('cancelled');
  }
  async function read<T>(path: string, decode: (value: unknown) => T, options?: { signal?: AbortSignal }): Promise<T> {
    assertSession();
    const result = await controller.request(path, options, decode);
    assertSession();
    return result;
  }
  const student = `/students/${studentId}`;
  return {
    async loadPlan(options) {
      // Today's request prepares assignments before history is read, matching the web service.
      const today = await read(`${student}/quran-today`, body => decodeStudentToday(body, studentId), options);
      const overview = await read(`${student}/quran-sessions?view=plan&includePoints=1`, body => decodeStudentOverview(body, studentId), options);
      return { today, overview };
    },
    loadLevel: options => read(`${student}/quran-level`, decodeStudentLevel, options),
    loadSaved: options => read(`${student}/quran-saved`, decodeStudentSaved, options),
    loadNews: options => read('/student-news', decodeStudentNews, options),
  };
}
