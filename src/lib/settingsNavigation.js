import {
  Bell,
  ArchiveX,
  BookOpenCheck,
  CalendarCheck2,
  CalendarRange,
  Route,
  Trophy,
} from 'lucide-react';

export const settingsNavigationItems = Object.freeze([
  { key: 'settingsGrading', slug: 'settings-grading', label: 'البرنامج الأسبوعي', icon: CalendarRange },
  { key: 'settingsTrackSession', slug: 'settings-track-session', label: 'جلسة المسار', icon: Route },
  { key: 'settingsWeeklySession', slug: 'settings-weekly-session', label: 'الجلسة الأسبوعية', icon: CalendarCheck2 },
  { key: 'settingsNarration', slug: 'settings-narration', label: 'يوم السرد', icon: BookOpenCheck },
  { key: 'settingsPoints', slug: 'settings-points', label: 'النقاط والترتيب', icon: Trophy },
  { key: 'settingsNotifications', slug: 'settings-notifications', label: 'إعدادات الإشعارات', icon: Bell },
  { key: 'settingsTerm', slug: 'settings-term', label: 'إنهاء الفصل وطلبات الحذف', icon: ArchiveX },
]);

export const defaultSettingsNavigationKey = 'settingsGrading';

export const isSettingsNavigationKey = (key) => (
  settingsNavigationItems.some((item) => item.key === key)
);
