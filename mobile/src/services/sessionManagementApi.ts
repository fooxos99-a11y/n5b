import { canTestSession, sessionAttendanceStatus } from '../../../shared/session-attendance.js';
import { studentsToPrepare } from '../../../src/services/sessionAttendanceBatch.js';
import { hasManagementGrant, positiveId } from '../domain/management';
import type { NativeSessionController } from '../domain/nativeSession';
import { decodeManagedCircle } from './managementApi';
import { dashboardObject } from '../domain/studentDashboard';
import { decodeSessionAttempt, decodeSessionWeek, sessionAttendanceDeletesEvaluation, sessionAttendancePayload, sessionEditable,
  sessionGrants, sessionSnapshot, sessionStudent, sessionTestSegments, validSessionComponent,
  type SessionAttempt, type SessionComponent, type SessionManagementData, type SessionSegmentDraft, type SessionStudent, type SessionWeek } from '../domain/sessionManagement';
import type { StudentAttendanceStatus } from '../domain/supervisorDashboard';
import { NativeApiError } from './nativeApi';

export function createSessionManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  function assertContext(component: SessionComponent) {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!validSessionComponent(component)) throw new NativeApiError('validation');
    if (!hasManagementGrant(identity, sessionGrants[component])) throw new NativeApiError('forbidden');
  }
  async function request<T>(component: SessionComponent, path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T) {
    assertContext(component); const value = await controller.request(path, options, decode); assertContext(component); return value;
  }
  function weekPath(component: SessionComponent, weekStart?: string, committeeId?: number) {
    const query = new URLSearchParams({ component });
    if (weekStart) query.set('weekStart', weekStart);
    if (committeeId) query.set('committeeId', String(positiveId(committeeId)));
    return `/grading/week?${query.toString()}`;
  }
  const loadWeek = (component: SessionComponent, weekStart?: string, committeeId?: number, signal?: AbortSignal) => request(component,
    weekPath(component, weekStart, committeeId), { signal }, value => decodeSessionWeek(value, component));
  async function assertFresh(week: SessionWeek, student: SessionStudent) {
    const latest = await loadWeek(week.component, week.weekStart);
    const current = latest.students.find(row => row.id === positiveId(student.id));
    if (!current || sessionSnapshot(week, student) !== sessionSnapshot(latest, current)) throw new NativeApiError('conflict', 409);
  }
  function acknowledgement(value: unknown) { const response = dashboardObject(value); if (response.ok !== true) throw new NativeApiError('invalid-response'); return response; }
  async function save(week: SessionWeek, payload: unknown) {
    return request(week.component, '/grading/weekly-component', { method: 'PUT', body: payload }, acknowledgement);
  }
  return {
    async load(component: SessionComponent, weekStart?: string, committeeId?: number, signal?: AbortSignal): Promise<SessionManagementData> {
      assertContext(component);
      const [week, circles] = await Promise.all([loadWeek(component, weekStart, committeeId, signal), request(component, '/committees', { signal }, value => {
        if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); return value.map(decodeManagedCircle);
      })]);
      return { week, circles };
    },
    async setAttendance(week: SessionWeek, studentId: number, status: StudentAttendanceStatus, confirmed = false) {
      assertContext(week.component); const student = sessionStudent(week, positiveId(studentId));
      const payload = sessionAttendancePayload(week, student, status);
      if (sessionAttendanceDeletesEvaluation(student, status) && !confirmed) throw new NativeApiError('validation');
      await assertFresh(week, student); await save(week, payload);
    },
    async prepareTest(week: SessionWeek, studentId: number, signal?: AbortSignal): Promise<SessionAttempt> {
      assertContext('track'); const student = sessionStudent(week, positiveId(studentId));
      if (week.component !== 'track' || !sessionEditable(week) || !canTestSession(student.detail)
        || student.detail?.operationType === 'compensation' || !week.policy.trackSession.segmentCount) throw new NativeApiError('validation');
      await assertFresh(week, student);
      return request('track', '/grading/track-test', { method: 'POST', body: { studentId: student.id, weekStart: week.weekStart }, signal },
        value => decodeSessionAttempt(value, week, student));
    },
    async saveTest(week: SessionWeek, attempt: SessionAttempt, drafts: readonly SessionSegmentDraft[]) {
      assertContext('track'); const student = sessionStudent(week, positiveId(attempt.studentId));
      if (week.component !== 'track' || attempt.weekStart !== week.weekStart || !sessionEditable(week) || !canTestSession(student.detail)
        || student.detail?.operationType === 'compensation') throw new NativeApiError('validation');
      const segments = sessionTestSegments(attempt, drafts, true); await assertFresh(week, student);
      await save(week, { studentId: student.id, weekStart: week.weekStart, component: 'track', attendanceStatus: sessionAttendanceStatus(student.detail ?? {}),
        segments, attemptToken: attempt.attemptToken });
    },
    async prepareAll(week: SessionWeek): Promise<{ saved: number; failed: number }> {
      assertContext(week.component); if (!sessionEditable(week)) throw new NativeApiError('validation');
      const result = { saved: 0, failed: 0 };
      const candidates: SessionStudent[] = studentsToPrepare(week.students.map(student => ({ ...student, grade: { [`${week.component}Detail`]: student.detail } })), week.component);
      for (const student of candidates) {
        assertContext(week.component);
        try { await assertFresh(week, student); await save(week, sessionAttendancePayload(week, student, 'present')); result.saved++; }
        catch (cause) {
          if (!(cause instanceof NativeApiError) || !['validation', 'conflict', 'not-found'].includes(cause.code)) throw cause;
          result.failed++;
        }
      }
      return result;
    },
  };
}
export type SessionManagementApi = ReturnType<typeof createSessionManagementApi>;
