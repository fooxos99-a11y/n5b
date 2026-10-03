import { studentsApi } from '@/services/studentsApi';
import { studentNewsService } from '@/services/studentNewsService';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { loadPublicSettingsCached } from '@/services/publicSettingsCache';

export async function loadStudentHomeExtras({ onUpdate, refresh = false }) {
  const keys = ['settings', 'news'];
  const entries = await Promise.allSettled([
    loadPublicSettingsCached({ refresh }),
    studentNewsService.load(),
  ].map((request, index) => Promise.resolve(request).then((value) => {
    onUpdate?.({ [keys[index]]: value, [`${keys[index]}Error`]: false });
    return value;
  }, (error) => { onUpdate?.({ [`${keys[index]}Error`]: true }); throw error; })));
  const value = (index) => entries[index].status === 'fulfilled' ? entries[index].value : null;
  return { settings: value(0), news: value(1), newsError: entries[1].status === 'rejected',
    settingsError: entries[0].status === 'rejected' };
}

export const loadStudentLevel = (studentId) => loadOfflineSnapshot(studentId, 'student:level-v1', () => studentsApi.getStudentQuranLevel(studentId), { actorRole: 'student' });

export const loadStudentMemorized = (studentId) => loadOfflineSnapshot(studentId, 'student:memorized-ranges-v1', () => studentsApi.getStudentQuranSaved(studentId), { actorRole: 'student' });

export async function loadStudentHomeRankings(studentId, { settings: providedSettings } = {}) {
  const settings = providedSettings || await loadPublicSettingsCached({ refresh: true });
  const [students, families] = await Promise.allSettled([
    settings.studentRankingsVisible === false ? [] : loadOfflineSnapshot(studentId, 'student:rankings', () => studentsApi.getStudentRankings({ committeeId: 'all' }), { actorRole: 'student' }),
    settings.familyRankingsVisible === false ? [] : loadOfflineSnapshot(studentId, 'student:family-rankings', () => studentsApi.getFamilyRankings(), { actorRole: 'student' }),
  ]);
  const rows = (result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value.filter((row) => row?.name).map((row, index) => ({ ...row, rank: Number(row.rank || index + 1) })) : [];
  return { settings, students: rows(students), families: rows(families), studentError: students.status === 'rejected', familyError: families.status === 'rejected' };
}
