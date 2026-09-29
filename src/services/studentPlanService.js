import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import { singleFlight } from '@/lib/asyncRequests';
import { getAuthSessionVersion } from '@/lib/authSession';
import { offlineActorKey, loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { getBusinessDate } from '../../shared/business-date.js';
import { studentsApi } from '@/services/studentsApi';


export const loadStudentToday = singleFlight(studentId => loadOfflineSnapshot(
  studentId, 'student:today-v1', () => studentsApi.getStudentQuranToday(studentId), { actorRole: 'student' },
), studentId => `${offlineActorKey(studentId, 'student')}:${getAuthSessionVersion()}:${getBusinessDate()}`);

export const loadStudentPlan = singleFlight((studentId) => loadOfflineSnapshot(studentId, 'student:my-plan-v1', async () => {
  // Generating today's assignments must finish before reading the weekly history.
  const today = await loadStudentToday(studentId);
  const overview = await studentsApi.getStudentPlanOverview(studentId);
  return { today, rows: Array.isArray(overview) ? overview : overview.rows, points: overview.points, weeklyGrade: overview.weeklyGrade };
}, { actorRole: 'student' }), studentId => `${offlineActorKey(studentId, 'student')}:${getAuthSessionVersion()}:${getBusinessDate()}`);

export async function readCachedStudentPlan(studentId, today) {
  const value = await offlineRecitationStore.getSnapshot(`${offlineActorKey(studentId, 'student')}:resource:student:my-plan-v1`);
  return value?.today?.date === today ? value : null;
}
