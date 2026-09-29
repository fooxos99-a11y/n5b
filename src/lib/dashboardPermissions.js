import { getSiteConfig } from '@/site/siteConfigs';

const allDashboardPermissionOptions = [
  { key: 'manualAttendance', label: 'تحضير الطلاب والمعلمين والإدارة' },
  { key: 'staffAttendance', label: 'تحضير حسابي' },
  { key: 'registrationRequests', label: 'طلبات التسجيل' },
  { key: 'students', label: 'الطلاب' },
  { key: 'studentPlans', label: 'خطط الطلاب' },
  { key: 'narrationDay', label: 'يوم السرد' },
  { key: 'calls', label: 'المكالمات' },
  { key: 'quranEvaluation', label: 'جلسات التسميع' },
  { key: 'grades', label: 'الجلسة الأسبوعية وجلسة المسار' },
  { key: 'families', label: 'الحلقات' },
  { key: 'supervisors', label: 'المعلمين' },
  { key: 'administrators', label: 'الإداريين' },
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

export const dashboardPermissionKeys = dashboardPermissionOptions.map((option) => option.key);

export const normalizeDashboardPermissions = (permissions = []) => {
  const allowed = new Set(dashboardPermissionKeys);
  return [...new Set(
    (Array.isArray(permissions) ? permissions : [])
      .map((permission) => String(permission || '').trim())
      .filter((permission) => allowed.has(permission))
  )];
};

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
