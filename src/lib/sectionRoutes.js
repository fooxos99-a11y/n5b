import { settingsNavigationItems } from '@/lib/settingsNavigation';

const createSectionRoutes = (entries) => {
  const slugByKey = Object.freeze(Object.fromEntries(entries));
  const keyBySlug = Object.freeze(Object.fromEntries(entries.map(([key, slug]) => [slug, key])));

  return {
    getSlug: (key) => slugByKey[key] || '',
    getKey: (slug) => keyBySlug[slug] || '',
  };
};

export const dashboardSectionRoutes = createSectionRoutes([
  ['manualAttendance', 'attendance'],
  ['staffAttendance', 'staff-attendance'],
  ['mushaf', 'mushaf'],
  ['notifications', 'notifications'],
  ['reports', 'reports'],
  ['users', 'users'],
  ['students', 'students'],
  ['studentPlans', 'student-plans'],
  ['teacherPoints', 'points-adjustment'],
  ['families', 'families'],
  ['supervisors', 'supervisors'],
  ['administrators', 'administrators'],
  ['narrationDay', 'narration-day'],
  ['quranPassing', 'passing'],
  ['calls', 'calls'],
  ['whatsappSend', 'whatsapp'],
  ['registrationRequests', 'registration-requests'],
  ['trackSession', 'track-session'],
  ['weeklySession', 'weekly-session'],
  ['settings', 'settings'],
  ['store', 'store'],
  ['settingsNews', 'news'],
  ['quranEvaluation', 'recitation-sessions'],
  ['previousRecitationSessions', 'previous-recitation-sessions'],
  ...settingsNavigationItems.map(({ key, slug }) => [key, slug]),
]);

export const portalSectionRoutes = createSectionRoutes([
  ['mushaf', 'mushaf'],
  ['quranSessions', 'my-plan'],
  ['quranSaved', 'quran-saved'],
  ['quranEvaluation', 'recitation-sessions'],
  ['previousRecitationSessions', 'previous-recitation-sessions'],
  ['studentPlans', 'student-plans'],
  ['teacherPoints', 'points-adjustment'],
  ['teacherReports', 'reports'],
  ['calls', 'calls'],
  ['store', 'store'],
  ['staffAttendance', 'staff-attendance'],
]);
