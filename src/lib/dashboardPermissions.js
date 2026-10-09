import { DASHBOARD_PERMISSION_KEYS, normalizeDashboardGrants } from '../../shared/dashboard-permissions.js';
import { getSiteConfig } from '@/site/siteConfigs';

const allDashboardPermissionOptions = [
  { key: 'manualAttendance', label: 'التحضير', group: 'التحضير' },
  { key: 'registrationRequests', label: 'طلبات التسجيل' },
  { key: 'students', label: 'الطلاب', group: 'المستخدمون' },
  { key: 'studentPlans', label: 'خطط الطلاب' },
  { key: 'narrationDay', label: 'يوم السرد' },
  { key: 'quranPassing', label: 'الاجتياز', group: 'الجلسات' },
  { key: 'calls', label: 'المكالمات' },
  { key: 'quranEvaluation', label: 'جلسات التسميع' },
  { key: 'weeklySession', label: 'الجلسة الأسبوعية', group: 'الجلسات' },
  { key: 'trackSession', label: 'جلسة المسار', group: 'الجلسات' },
  { key: 'families', label: 'المجمعات والحلقات' },
  { key: 'supervisors', label: 'مشرفو المسارات', group: 'المستخدمون' },
  { key: 'administrators', label: 'الإداريون', group: 'المستخدمون' },
  { key: 'notifications', label: 'الإشعارات' },
  { key: 'reports', label: 'الإحصائيات' },
  { key: 'whatsappSend', label: 'الإرسال عبر الواتس' },
  { key: 'settings', label: 'الإعدادات' },
  { key: 'store', label: 'المتجر' },
];

const siteFeatures = getSiteConfig().features || {};

export const dashboardPermissionOptions = allDashboardPermissionOptions.filter((option) => (
  option.key !== 'store' || siteFeatures.store !== false
));

export const dashboardPermissionKeys = [...DASHBOARD_PERMISSION_KEYS];

export const normalizeDashboardPermissions = normalizeDashboardGrants;

export const readStoredDashboardPermissions = () => {
  try {
    return normalizeDashboardPermissions(JSON.parse(localStorage.getItem('wajeh_dashboard_permissions') || '[]'));
  } catch {
    return [];
  }
};

export const storeDashboardPermissions = (permissions = []) => {
  localStorage.setItem('wajeh_dashboard_permissions', JSON.stringify(normalizeDashboardPermissions(permissions)));
};
