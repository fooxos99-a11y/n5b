import type { NativeSession, NativeSessionController } from '../domain/nativeSession';
import { NativeApiError } from './nativeApi';
import { distanceInMeters } from '../../../shared/staff-attendance.js';
import { canSetStudentAttendance, decodeStaffAttendance, decodeSupervisorEvaluation, decodeSupervisorHistory,
  decodeSupervisorRoster, validSupervisorDate, type StaffAttendance, type StudentAttendanceStatus,
  type SupervisorEvaluation, type SupervisorHistoryRow, type SupervisorStudent } from '../domain/supervisorDashboard';

type ScopedController = Pick<NativeSessionController, 'getSnapshot' | 'request'>;
export interface SupervisorDashboardApi {
  loadEvaluation(options?: { date?: string; signal?: AbortSignal }): Promise<SupervisorEvaluation>;
  loadRoster(signal?: AbortSignal): Promise<readonly SupervisorStudent[]>;
  loadStaffAttendance(signal?: AbortSignal): Promise<StaffAttendance>;
  checkInStaffAttendance(record: StaffAttendance, coordinates?: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<StaffAttendance>;
  setStudentAttendance(evaluation: SupervisorEvaluation, studentId: number, status: StudentAttendanceStatus, signal?: AbortSignal): Promise<void>;
  loadStudentHistory(studentId: number, signal?: AbortSignal): Promise<readonly SupervisorHistoryRow[]>;
}
export function createSupervisorDashboardApi(session: NativeSession, controller: ScopedController): SupervisorDashboardApi {
  const scope = JSON.stringify([session.role, session.id, session.complex.registrationNumber]);
  let evaluation: SupervisorEvaluation | null = null;
  let staff: StaffAttendance | null = null;
  let roster: readonly SupervisorStudent[] = [];
  let evaluationEpoch = 0;
  let staffEpoch = 0;
  let rosterEpoch = 0;
  const pendingAttendance = new Set<number>();
  let checkingIn = false;
  function current() {
    const snapshot = controller.getSnapshot();
    const identity = snapshot.session;
    if (session.role !== 'supervisor' || snapshot.status !== 'authenticated' || !identity
      || scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('unauthorized');
  }
  current();
  return {
    loadEvaluation: async options => {
      current(); const epoch = ++evaluationEpoch; evaluation = null;
      if (options?.date !== undefined && !validSupervisorDate(options.date)) throw new NativeApiError('validation');
      const value = await controller.request(`/supervisors/${session.id}/quran-evaluation${options?.date ? `?date=${options.date}` : ''}`,
        { signal: options?.signal }, decodeSupervisorEvaluation);
      current(); if (epoch !== evaluationEpoch) throw new NativeApiError('cancelled');
      evaluation = value; return value;
    },
    loadRoster: async signal => {
      current(); const epoch = ++rosterEpoch; roster = [];
      const value = await controller.request('/reports/students', { signal }, decodeSupervisorRoster);
      current(); if (epoch !== rosterEpoch) throw new NativeApiError('cancelled');
      roster = value; return value;
    },
    loadStaffAttendance: async signal => {
      current(); const epoch = ++staffEpoch; staff = null;
      const value = await controller.request('/staff-attendance/me', { signal }, decodeStaffAttendance);
      current(); if (epoch !== staffEpoch) throw new NativeApiError('cancelled');
      staff = value; return value;
    },
    checkInStaffAttendance: async (record, coordinates, signal) => {
      current();
      if (checkingIn || record !== staff || !record.enabled || !record.canAttend || record.alreadyPresent || !record.policy) throw new NativeApiError('forbidden');
      let body: Record<string, number> = {};
      if (record.policy.locationRequired) {
        if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)
          || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180) throw new NativeApiError('validation');
        const distance = distanceInMeters({ lat: coordinates.latitude, lng: coordinates.longitude },
          { lat: record.policy.latitude, lng: record.policy.longitude });
        if (distance > record.policy.radiusMeters) throw new NativeApiError('forbidden');
        body = { latitude: coordinates.latitude, longitude: coordinates.longitude };
      }
      checkingIn = true;
      const epoch = ++staffEpoch;
      try {
        const value = await controller.request('/staff-attendance/me', { method: 'POST', body, signal }, decodeStaffAttendance);
        current(); if (epoch !== staffEpoch) throw new NativeApiError('cancelled');
        staff = value; return value;
      } finally { checkingIn = false; }
    },
    setStudentAttendance: async (record, studentId, status, signal) => {
      current();
      if (record !== evaluation || !canSetStudentAttendance(record, studentId) || pendingAttendance.has(studentId)) throw new NativeApiError('forbidden');
      if (!['present', 'late', 'excused', 'absent'].includes(status)) throw new NativeApiError('validation');
      pendingAttendance.add(studentId);
      try {
        await controller.request(`/students/${studentId}/attendance`, { method: 'POST', signal,
          body: { mode: 'recitation_teacher', date: record.date, status } }, body => {
          if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true
            || !('date' in body) || body.date !== record.date || !('status' in body) || body.status !== status) throw new NativeApiError('invalid-response');
        });
        current();
      } finally { pendingAttendance.delete(studentId); }
    },
    loadStudentHistory: async (studentId, signal) => {
      current();
      if (!roster.some(student => student.id === studentId)) throw new NativeApiError('forbidden');
      const value = await controller.request(`/reports/student-recitation-history?studentId=${studentId}`,
        { signal }, body => decodeSupervisorHistory(body, studentId));
      current(); return value;
    },
  };
}
