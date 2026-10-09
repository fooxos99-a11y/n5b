import { groupUserSections, userSectionKeys } from '@/lib/userSections';
import DashboardUndoNotice from '@/components/dashboard/DashboardUndoNotice';
import useDashboardUndoRefresh from '@/hooks/useDashboardUndoRefresh';
import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import { defaultAccountSection } from '@/lib/defaultAccountSection';
import OfflineConnectionRequired from '@/components/network/OfflineConnectionRequired';
import useStaffAttendance from '@/hooks/useStaffAttendance';
import NotificationButton from '@/components/notifications/NotificationButton';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from '@/lib/router';
import {
  CalendarCheck2,
  Route,
  Newspaper,
  Bell,
  Building2,
  BookMarked,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  GraduationCap,
  History,
  ListChecks,
  LogOut,
  PhoneCall,
  PlusCircle,
  Send,
  Settings,
  Store,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import CustomCursor from '@/components/CustomCursor';
import LazyCallsSection from '@/components/calls/LazyCallsSection';
import LazyAudioCallRoom from '@/components/calls/LazyAudioCallRoom';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/services/studentsApi';
import LoadingScreen from '@/components/LoadingScreen';
import { hasAuthSession } from '@/lib/authSession';
import { useAccountLogout } from '@/hooks/useAccountLogout';
import { readStoredDashboardPermissions, storeDashboardPermissions } from '@/lib/dashboardPermissions';
import { dashboardSectionRoutes } from '@/lib/sectionRoutes';
import {
  defaultSettingsNavigationKey,
  isSettingsNavigationKey,
  settingsNavigationItems,
} from '@/lib/settingsNavigation';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { useSiteConfig } from '@/site/SiteProvider';
import StaffAttendancePrompt from '@/components/attendance/StaffAttendancePrompt';

const UsersSection = lazy(() => import('@/components/dashboard/UsersSection'));
const FamiliesSection = lazy(() => import('@/components/dashboard/FamiliesSection'));
const ManualAttendanceSection = lazy(() => import('@/components/dashboard/ManualAttendanceSection'));
const NarrationDaySection = lazy(() => import('@/components/dashboard/NarrationDaySection'));
const PassingSection = lazy(() => import('@/components/dashboard/passing/PassingSection'));
const TrackSessionSection = lazy(() => import('@/components/dashboard/grades/TrackSessionSection'));
const WeeklySessionSection = lazy(() => import('@/components/dashboard/grades/WeeklySessionSection'));
const RegistrationRequestsSection = lazy(() => import('@/components/dashboard/RegistrationRequestsSection'));
const NotificationsSection = lazy(() => import('@/components/dashboard/NotificationsSection'));
const ReportsSection = lazy(() => import('@/components/dashboard/ReportsSection'));
const StudentNewsEditor = lazy(() => import('@/components/dashboard/StudentNewsEditor'));
const SettingsSection = lazy(() => import('@/components/dashboard/SettingsSection'));
const StoreSection = lazy(() => import('@/components/dashboard/StoreSection'));
const StudentPlansSection = lazy(() => import('@/components/dashboard/StudentPlansSection'));
const TeacherEvaluationSection = lazy(() => import('@/components/dashboard/TeacherEvaluationSection'));
const TeacherPreviousSessionsPanel = lazy(() => import('@/components/portal/TeacherPreviousSessionsPanel'));
const RecitationSettingsButton = lazy(() => import('@/components/portal/RecitationSettingsButton'));
const WhatsAppSendSection = lazy(() => import('@/components/dashboard/WhatsAppSendSection'));
const StaffAttendanceSection = lazy(() => import('@/components/attendance/StaffAttendanceSection'));
const StudentMushafSection = lazy(() => import('@/components/portal/StudentMushafSection'));
const TeacherPointsAdjustmentSection = lazy(() => import('@/components/portal/TeacherPointsAdjustmentSection'));

const dashboardSectionPreloaders = {
  users: () => import('@/components/dashboard/UsersSection'),
  administrators: () => import('@/components/dashboard/AdministratorsSection'),
  families: () => import('@/components/dashboard/FamiliesSection'),
  manualAttendance: () => import('@/components/dashboard/ManualAttendanceSection'),
  narrationDay: () => import('@/components/dashboard/NarrationDaySection'),
  quranPassing: () => import('@/components/dashboard/passing/PassingSection'),
  trackSession: () => import('@/components/dashboard/grades/TrackSessionSection'),
  weeklySession: () => import('@/components/dashboard/grades/WeeklySessionSection'),
  registrationRequests: () => import('@/components/dashboard/RegistrationRequestsSection'),
  notifications: () => import('@/components/dashboard/NotificationsSection'),
  reports: () => import('@/components/dashboard/ReportsSection'),
  settings: () => import('@/components/dashboard/SettingsSection'),
  store: () => import('@/components/dashboard/StoreSection'),
  settingsNews: () => import('@/components/dashboard/StudentNewsEditor'),
  studentPlans: () => import('@/components/dashboard/StudentPlansSection'),
  students: () => import('@/components/dashboard/StudentsSection'),
  supervisors: () => import('@/components/dashboard/SupervisorsSection'),
  quranEvaluation: () => import('@/components/dashboard/TeacherEvaluationSection'),
  previousRecitationSessions: () => import('@/components/portal/TeacherPreviousSessionsPanel'),
  whatsappSend: () => import('@/components/dashboard/WhatsAppSendSection'),
  staffAttendance: () => import('@/components/attendance/StaffAttendanceSection'),
  mushaf: () => import('@/components/portal/StudentMushafSection'),
  teacherPoints: () => import('@/components/portal/TeacherPointsAdjustmentSection'),
};

const defaultSettings = {
  attendanceManualEnabled: true,
  quranTaskExecutionSource: 'student',
  hasStudentQuranExecution: true,
  recitationAttendanceSource: 'supervisor',
  teacherManualPointsEnabled: false,
  storeEnabled: false,
  staffAttendanceSource: 'supervisor',
};

const sectionFeatureKeys = {
  reports: 'reportsSectionEnabled',
  students: 'studentsSectionEnabled',
  studentPlans: 'studentPlansSectionEnabled',
  families: 'committeesSectionEnabled',
  supervisors: 'usersRolesSectionEnabled',
  administrators: 'usersRolesSectionEnabled',
  narrationDay: 'narrationSectionEnabled',
  calls: 'callsSectionEnabled',
  registrationRequests: 'registrationRequestsSectionEnabled',
  store: 'storeSectionEnabled',
};

const baseSections = [
  { key: 'manualAttendance', label: 'التحضير', icon: ClipboardCheck },
  { key: 'staffAttendance', label: 'تحضير حسابي', icon: ClipboardCheck },
  { key: 'mushaf', label: 'المصحف', icon: BookOpen },
  { key: 'reports', label: 'الإحصائيات', icon: BarChart3 },
  { key: 'students', label: 'الطلاب', icon: GraduationCap },
  { key: 'families', label: 'المجمعات والحلقات', icon: Building2 },
  { key: 'studentPlans', label: 'خطط الطلاب', icon: ListChecks },
  { key: 'teacherPoints', label: 'الإضافة والخصم', icon: PlusCircle, supervisorOnly: true },
  { key: 'trackSession', label: 'جلسة المسار', icon: Route, permissionKey: 'trackSession' },
  { key: 'weeklySession', label: 'الجلسة الأسبوعية', icon: CalendarCheck2, permissionKey: 'weeklySession' },
  { key: 'supervisors', label: 'مشرفي المسارات', icon: Users },
  { key: 'administrators', label: 'الإداريين', icon: ShieldCheck },
  { key: 'narrationDay', label: 'يوم السرد', icon: BookMarked },
  { key: 'quranPassing', label: 'الاجتياز', icon: ClipboardCheck },
  { key: 'calls', label: 'المكالمات', icon: PhoneCall },
  { key: 'notifications', label: 'الإشعارات', icon: Bell },
  { key: 'whatsappSend', label: 'الإرسال عبر الواتس', icon: Send },
  { key: 'registrationRequests', label: 'طلبات التسجيل', icon: UserPlus },
  { key: 'store', label: 'المتجر', icon: Store },
  { key: 'settingsNews', label: 'الأخبار', icon: Newspaper, permissionKey: 'settings' },
  { key: 'settings', label: 'الإعدادات', icon: Settings, children: settingsNavigationItems },
  { key: 'quranEvaluation', label: 'جلسات التسميع', icon: ClipboardCheck, supervisorOnly: true },
  {
    key: 'previousRecitationSessions',
    permissionKey: 'quranEvaluation',
    label: 'جلسات التسميع السابقة',
    icon: History,
    supervisorOnly: true,
  },
];

const supervisorSectionOrder = new Map([
  ['staffAttendance', 0],
  ['quranEvaluation', 1],
  ['previousRecitationSessions', 2],
  ['teacherPoints', 3],
  ['reports', 4],
  ['calls', 5],
  ['studentPlans', Number.POSITIVE_INFINITY],
]);

// Management sidebar: statistics on top, then attendance, the two weekly sessions, users, plans and committees; the rest keep their order.
const managementSectionOrder = new Map([
  ['reports', -1],
  ['staffAttendance', 0],
  ['manualAttendance', 1],
  ['weeklySession', 2],
  ['trackSession', 3],
  ...userSectionKeys.map((key) => [key, 4]),
  ['studentPlans', 5],
  ['families', 6],
]);

const offlineDashboardSections = new Set([
  'staffAttendance',
  'mushaf',
  'reports',
  'students',
  'studentPlans',
  'families',
  'narrationDay',
  'quranEvaluation',
  'previousRecitationSessions',
]);

const WajehDashboard = () => {
  const undoRevision = useDashboardUndoRefresh();
  const site = useSiteConfig();
  const navigate = useNavigate();
  const { section: sectionSlug = '' } = useParams();
  const isOnline = useOnlineStatus();
  const [settings, setSettings] = useState(defaultSettings);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardPermissions, setDashboardPermissions] = useState(readStoredDashboardPermissions);
  const [activeCallRoom, setActiveCallRoom] = useState(null);
  const role = localStorage.getItem('wajeh_role') || '';
  const supervisorId = Number(localStorage.getItem('wajeh_supervisor_id') || 0);
  const hasSession = hasAuthSession(role);
  const isManager = role === 'manager' && hasSession;
  const isSupervisor = role === 'supervisor' && hasSession;
  const isAdmin = role === 'admin' && hasSession;
  const hasDashboardAccess = isManager || isAdmin || (isSupervisor && dashboardPermissions.length > 0);

  useEffect(() => {
    const routeKey = dashboardSectionRoutes.getKey(sectionSlug);
    const _resolvePreloadKey = () => {
      if (isSettingsNavigationKey(routeKey)) {
        return 'settings';
      }
      return routeKey;
    };
    const preloadKey = _resolvePreloadKey();
    dashboardSectionPreloaders[preloadKey]?.();
  }, [sectionSlug]);

  useEffect(() => {
    if (!isOnline) {
      setIsDashboardLoading(false);
      return;
    }
    if (isManager || isSupervisor || isAdmin) {
      studentsApi.getDashboardBootstrap()
        .then((data) => {
          setSettings({ ...defaultSettings, ...(data.settings) });
          const permissions = data.permissions || [];
          storeDashboardPermissions(permissions);
          setDashboardPermissions(permissions);
        })
        .catch(() => {
          setSettings(defaultSettings);
          if (!isManager) {
            storeDashboardPermissions([]);
            setDashboardPermissions([]);
          }
        })
        .finally(() => setIsDashboardLoading(false));
    } else {
      setIsDashboardLoading(false);
    }
  }, [isAdmin, isManager, isOnline, isSupervisor]);

  const staffAttendanceActive = settings.staffAttendanceSource === 'teacher' && (isSupervisor || isAdmin);
  const staffAttendanceState = useStaffAttendance(staffAttendanceActive);
  const { alreadyPresentToday } = staffAttendanceState;
  const waitingForAttendance = staffAttendanceActive && !staffAttendanceState.attendance && !staffAttendanceState.error;
  const navigationLoading = isDashboardLoading || waitingForAttendance;

  const sections = useMemo(() => {
    const filteredSections = baseSections.filter((section) => {
      if (isDashboardSectionDisabled({ section, settings, isManager, isSupervisor, site })) return false;
      if (isSupervisor && section.key === 'studentPlans') return true;
      if (isSupervisor && ['teacherPoints', 'calls', 'reports'].includes(section.key)) return true;
      if (section.key === 'staffAttendance') return canDisplayStaffAttendance({ settings, alreadyPresentToday, isSupervisor, isAdmin, dashboardPermissions });
      // The mushaf page belongs to teachers only; management has no mushaf page.
      if (section.key === 'mushaf') return isSupervisor;
      const permissionKeys = section.permissionKeys || [section.permissionKey || section.key];
      if (!isManager && !permissionKeys.some((key) => dashboardPermissions.includes(key))) return false;
      if (!isSupervisor && section.key === 'manualAttendance' && (!settings.attendanceManualEnabled || settings.recitationAttendanceSource === 'teacher')) return false;
      return true;
    });

    const availableSections = isOnline
      ? filteredSections
      : filteredSections.filter((section) => offlineDashboardSections.has(section.key));
    if (!isSupervisor) return groupUserSections([...availableSections].sort((first, second) => (
      (managementSectionOrder.get(first.key) ?? Number.MAX_SAFE_INTEGER)
      - (managementSectionOrder.get(second.key) ?? Number.MAX_SAFE_INTEGER)
    )));
    return groupUserSections([...availableSections].sort((first, second) => (
      (supervisorSectionOrder.get(first.key) ?? Number.MAX_SAFE_INTEGER)
      - (supervisorSectionOrder.get(second.key) ?? Number.MAX_SAFE_INTEGER)
    )));
  }, [alreadyPresentToday, dashboardPermissions, isAdmin, isManager, isOnline, isSupervisor, settings, site.features]);

  const routeSection = dashboardSectionRoutes.getKey(sectionSlug);
  const _resolveRequestedSection = () => {
    if (routeSection === 'settings') {
      return defaultSettingsNavigationKey;
    }
    return userSectionKeys.includes(routeSection) ? 'users' : routeSection;
  };
  const requestedSection = _resolveRequestedSection();
  const isVisibleSection = sections.some((section) => (
    section.key === requestedSection
    || section.children?.some((child) => child.key === requestedSection)
  ));
  // A failed connectivity probe hides online-only sections. Keep the user on the
  // page they opened instead of redirecting them to another section.
  const waitingForConnection = !isOnline && !isVisibleSection
    && Boolean(requestedSection) && !offlineDashboardSections.has(requestedSection);
  const visibleActiveSection = isVisibleSection || waitingForConnection
    ? requestedSection
    : defaultAccountSection(role, sections);

  useEffect(() => {
    if (navigationLoading || !hasDashboardAccess || !visibleActiveSection || waitingForConnection) return;
    const canonicalSlug = dashboardSectionRoutes.getSlug(visibleActiveSection);
    if (sectionSlug !== canonicalSlug) {
      const tab = userSectionKeys.includes(routeSection) && visibleActiveSection === 'users' ? `?tab=${routeSection}` : '';
      navigate(`/dashboard/${canonicalSlug}${tab}`, { replace: true });
    }
  }, [hasDashboardAccess, navigationLoading, navigate, routeSection, sectionSlug, visibleActiveSection, waitingForConnection]);

  const changeSection = useCallback((key) => {
    const slug = dashboardSectionRoutes.getSlug(key);
    if (slug) navigate(`/dashboard/${slug}`);
  }, [navigate]);

  const logout = useAccountLogout();

  const clearActiveCall = useCallback(() => setActiveCallRoom(null), []);
  const restoreActiveCall = useCallback(() => changeSection('calls'), [changeSection]);

  const renderSection = () => {
    if (waitingForConnection) return <OfflineConnectionRequired message="انقطع الاتصال بالخادم. ستعود الصفحة تلقائيًا عند عودة الاتصال." />;
    // Select the requested view without evaluating unrelated page branches.
    switch (visibleActiveSection) {
      case 'users': return <UsersSection tabs={sections.find(({ key }) => key === 'users')?.userTabs} />;
      case 'registrationRequests': return <RegistrationRequestsSection />;
      case 'studentPlans': return <StudentPlansSection hideCommitteeFilter={isSupervisor && !isManager} />;
      case 'teacherPoints': return <TeacherPointsAdjustmentSection />;
      case 'quranEvaluation': return <TeacherEvaluationSection />;
      case 'previousRecitationSessions': return <TeacherPreviousSessionsPanel />;
      case 'families': return <FamiliesSection />;
      case 'reports': return (
      <ReportsSection
        teacherScoped={isSupervisor}
        canViewStandardReports={isSupervisor || isManager || dashboardPermissions.includes('reports')}
        canViewTeacherPoints={settings.teacherManualPointsEnabled}
      />
    );
      case 'calls': return activeCallRoom ? null : <LazyCallsSection onJoinRoom={setActiveCallRoom} />;
      case 'narrationDay': return <NarrationDaySection />;
      case 'quranPassing': return <PassingSection />;
      case 'notifications': return <NotificationsSection />;
      case 'whatsappSend': return <WhatsAppSendSection />;
      case 'trackSession': return <TrackSessionSection />;
      case 'weeklySession': return <WeeklySessionSection />;
      case 'manualAttendance': return <ManualAttendanceSection teacherScoped={isSupervisor} />;
      case 'staffAttendance': return <StaffAttendanceSection attendanceState={staffAttendanceState} />;
      case 'mushaf': return <StudentMushafSection />;
    }
    if (isSettingsNavigationKey(visibleActiveSection)) return (
      <SettingsSection
        activeCategory={visibleActiveSection}
        onSettingsChange={setSettings}
        canManageDeletionRequests={isManager || ((isAdmin || isSupervisor) && dashboardPermissions.includes('settings'))}
        canResetPoints={isManager}
      />
    );
    if (visibleActiveSection === 'settingsNews') return <StudentNewsEditor />;
    if (visibleActiveSection === 'store') return <StoreSection />;
    return (
      <Card className="border-primary/30 bg-card">
        <CardContent className="p-8 text-muted-foreground">القسم غير متاح حالياً.</CardContent>
      </Card>
    );
  };

  if (navigationLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground [font-family:var(--font-ui)]" dir="rtl">
        <CustomCursor />
        <LoadingScreen />
      </div>
    );
  }

  if (!hasDashboardAccess) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-foreground [font-family:var(--font-ui)]" dir="rtl">
        <CustomCursor />
        <Helmet>
          <title>غير مصرح</title>
        </Helmet>
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-[0_12px_35px_hsl(210_40%_20%/0.08)]">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-black text-foreground">غير مصرح بالدخول</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">هذا الحساب لا يملك صلاحية الوصول إلى لوحة التحكم.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={logout}>
            <LogOut className="h-4 w-4" />
            العودة لتسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  if (visibleActiveSection === 'mushaf') {
    const returnSection = sections.find((section) => section.key !== 'mushaf');
    return (
      <div className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-background [font-family:var(--font-ui)]" dir="rtl">
        <PageLoadingBoundary><Suspense fallback={<DashboardLoader mode="screen" className="h-dvh" />}>
          <StudentMushafSection onBack={() => returnSection && changeSection(returnSection.key)} />
        </Suspense></PageLoadingBoundary>
      </div>
    );
  }

  return (
    <>
    <DashboardUndoNotice active={isAdmin || isManager} />
    <StaffAttendancePrompt active={staffAttendanceActive} attendanceState={staffAttendanceState} />
    <DashboardShell
      headerContent={visibleActiveSection === 'quranEvaluation' ? <><Suspense fallback={null}><RecitationSettingsButton staffId={supervisorId} /></Suspense><NotificationButton showTrigger={false} /></> : <NotificationButton />}
      title={site.name}
      logo={site.markLogo || site.squareLogo || site.logo}
      sections={sections}
      activeSection={visibleActiveSection}
      contentKey={isSettingsNavigationKey(visibleActiveSection) ? 'settings' : visibleActiveSection}
      onSectionChange={changeSection}
      onLogout={logout}
      persistentContent={activeCallRoom ? (
        <LazyAudioCallRoom
          roomInfo={activeCallRoom}
          isOwner={activeCallRoom.isOwner}
          minimized={visibleActiveSection !== 'calls'}
          onRestore={restoreActiveCall}
          onLeave={clearActiveCall}
          onClosed={clearActiveCall}
        />
      ) : null}
    >
      <Suspense key={undoRevision} fallback={<DashboardLoader className="min-h-[420px]" />}>
        {renderSection()}
      </Suspense>
    </DashboardShell>
    </>
  );
};

export default WajehDashboard;

/** Apply feature and role restrictions before any section permission can grant visibility. */
function isDashboardSectionDisabled({ section, settings, isManager, isSupervisor, site }) {
      const featureKey = sectionFeatureKeys[section.key];
      if (featureKey && settings[featureKey] === false) return true;
      if (section.managerOnly && !isManager) return true;
      if (section.key === 'store' && site.features?.store === false) return true;
      if (section.key === 'teacherPoints' && !settings.teacherManualPointsEnabled) return true;
      if (section.supervisorOnly && !isSupervisor) return true;

  return false;
}

/** Show self attendance only before attendance is recorded and for an authorized staff account. */
function canDisplayStaffAttendance({ settings, alreadyPresentToday, isSupervisor, isAdmin, dashboardPermissions }) {
return settings.staffAttendanceSource === 'teacher' && !alreadyPresentToday && (
          isSupervisor
          || isAdmin
        );
      
}
