import type { NativeRole, NativeSession } from './nativeSession';
import { hasManagementGrant } from './management';
import { NativeApiError } from '../services/nativeApi';
import { normalizeSiteRegistrationNumber } from '../../../shared/registration-link.js';

export type ManagementSection = 'registrationRequests' | 'students' | 'families' | 'supervisors' | 'administrators' | 'studentPlans'
  | 'manualAttendance' | 'weeklySession' | 'trackSession' | 'narrationDay' | 'quranPassing' | 'reports' | 'store' | 'news' | 'notifications';
export type DashboardFeatures = Record<ManagementSection, boolean>;
export const managementSections: readonly { key: ManagementSection; label: string }[] = [
  { key: 'registrationRequests', label: 'طلبات التسجيل' }, { key: 'students', label: 'الطلاب' }, { key: 'families', label: 'المجمعات والحلقات' },
  { key: 'supervisors', label: 'مشرفو المسارات' }, { key: 'administrators', label: 'الإداريون' }, { key: 'studentPlans', label: 'خطط الطلاب' },
  { key: 'manualAttendance', label: 'التحضير' }, { key: 'weeklySession', label: 'الجلسة الأسبوعية' }, { key: 'trackSession', label: 'جلسة المسار' },
  { key: 'narrationDay', label: 'يوم السرد' }, { key: 'quranPassing', label: 'الاجتياز' },
  { key: 'reports', label: 'الإحصائيات والتقارير' },
  { key: 'store', label: 'المتجر' },
  { key: 'news', label: 'الأخبار' }, { key: 'notifications', label: 'إرسال الإشعارات' },
];
const featureKeys: Partial<Record<ManagementSection, string>> = { registrationRequests: 'registrationRequestsSectionEnabled', students: 'studentsSectionEnabled', families: 'committeesSectionEnabled',
  supervisors: 'usersRolesSectionEnabled', administrators: 'usersRolesSectionEnabled', studentPlans: 'studentPlansSectionEnabled', narrationDay: 'narrationSectionEnabled', reports: 'reportsSectionEnabled', store: 'storeSectionEnabled' };
export function decodeDashboardFeatures(value: unknown, role?: NativeRole): DashboardFeatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  const row = value as Record<string, unknown>; const result: DashboardFeatures = { registrationRequests: false, students: false, families: false,
    supervisors: false, administrators: false, studentPlans: false, manualAttendance: false, weeklySession: true, trackSession: true,
    narrationDay: false, quranPassing: true, reports: false, store: false, news: true, notifications: true };
  for (const section of managementSections) {
    const key = featureKeys[section.key];
    if (!key) continue;
    const enabled = row[key];
    if (typeof enabled !== 'boolean') throw new NativeApiError('invalid-response');
    result[section.key] = enabled;
  }
  if (typeof row.attendanceManualEnabled !== 'boolean' || !['supervisor', 'teacher'].includes(String(row.recitationAttendanceSource)))
    throw new NativeApiError('invalid-response');
  result.manualAttendance = row.attendanceManualEnabled && row.recitationAttendanceSource !== 'teacher';
  if (role === 'student') {
    if (typeof row.storeEnabled !== 'boolean') throw new NativeApiError('invalid-response');
    for (const section of managementSections) result[section.key] = section.key === 'store' && row.storeEnabled;
  }
  return result;
}
export function availableManagementSections(session: NativeSession, features: DashboardFeatures) {
  return managementSections.filter(section => (section.key === 'reports' && session.role === 'supervisor')
    || (section.key === 'store' && session.role === 'student' && features.store)
    || ((features[section.key] || (section.key === 'manualAttendance' && session.role === 'supervisor'))
      && hasManagementGrant(session, section.key === 'news' ? 'settings' : section.key)));
}
export function nativeRegistrationLink(registrationNumber: string): string {
  const number = normalizeSiteRegistrationNumber(registrationNumber);
  return number ? `nukhab://register?registrationNumber=${encodeURIComponent(number)}` : '';
}
