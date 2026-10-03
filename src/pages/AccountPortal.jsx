import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import RankingPointsValue from '@/components/points/RankingPointsValue';
import { defaultAccountSection } from '@/lib/defaultAccountSection';
import useStaffAttendance from '@/hooks/useStaffAttendance';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, ClipboardCheck, History, ListChecks, PhoneCall, PlusCircle, ShoppingBag } from 'lucide-react';
import { useNavigate, useParams } from '@/lib/router';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardShell from '@/components/dashboard/DashboardShell';
import LazyCallsSection from '@/components/calls/LazyCallsSection';
import OfflineConnectionRequired from '@/components/network/OfflineConnectionRequired';
import PointsValue from '@/components/points/PointsValue';
import { Card, CardContent } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { getAuthSessionMarker } from '@/lib/authSession';
import { useAccountLogout } from '@/hooks/useAccountLogout';
import { readStoredDashboardPermissions, storeDashboardPermissions } from '@/lib/dashboardPermissions';
import { portalSectionRoutes } from '@/lib/sectionRoutes';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { studentsApi } from '@/services/studentsApi';
import { useSiteConfig } from '@/site/SiteProvider';
import StaffAttendancePrompt from '@/components/attendance/StaffAttendancePrompt';
import StudentNotificationButton from '@/components/portal/StudentNotificationButton';
import { loadPublicSettingsCached, readPublicSettingsCache } from '@/services/publicSettingsCache';

const StudentMushafSection = lazy(() => import('@/components/portal/StudentMushafSection'));
const StudentPlanPanel = lazy(() => import('@/components/portal/StudentPlanPanel'));
const TeacherEvaluationDialog = lazy(() => import('@/components/portal/TeacherEvaluationDialog'));
const TeacherPreviousSessionsPanel = lazy(() => import('@/components/portal/TeacherPreviousSessionsPanel'));
const RecitationSettingsButton = lazy(() => import('@/components/portal/RecitationSettingsButton'));
const ReportsSection = lazy(() => import('@/components/dashboard/ReportsSection'));
const StudentStoreSection = lazy(() => import('@/components/portal/StudentStoreSection'));
const StaffAttendanceSection = lazy(() => import('@/components/attendance/StaffAttendanceSection'));
const StudentPlansSection = lazy(() => import('@/components/dashboard/StudentPlansSection'));
const TeacherPointsAdjustmentSection = lazy(() => import('@/components/portal/TeacherPointsAdjustmentSection'));

const AccountPortal = () => {
  const site = useSiteConfig();
  const navigate = useNavigate();
  const { section: sectionSlug = '' } = useParams();
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const [session] = useState(() => ({
    token: getAuthSessionMarker(),
    role: localStorage.getItem('wajeh_role') || '',
    name: localStorage.getItem('wajeh_name') || '',
    studentId: localStorage.getItem('wajeh_student_id') || '',
    supervisorId: localStorage.getItem('wajeh_supervisor_id') || '',
    dashboardPermissions: readStoredDashboardPermissions(),
  }));
  const cachedSettings = useMemo(() => readPublicSettingsCache(), []);
  const [settings, setSettings] = useState(() => cachedSettings || {
    teacherManualPointsEnabled: false,
    storeEnabled: false,
    quranTaskExecutionSource: 'student',
    hasStudentQuranExecution: true,
    staffAttendanceSource: 'supervisor',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [storeBalance, setStoreBalance] = useState(0);
  const [planPoints, setPlanPoints] = useState(null);
  const [readerTarget, setReaderTarget] = useState(null);

  const hasDashboard = session.role === 'manager'
    || (['supervisor', 'admin'].includes(session.role) && session.dashboardPermissions.length > 0);
  const [permissionsReady, setPermissionsReady] = useState(!['supervisor', 'admin'].includes(session.role) || !session.supervisorId || hasDashboard);
  useEffect(() => {
    if (!session.token || !session.role) {
      navigate('/', { replace: true });
      return;
    }
    if (hasDashboard) navigate('/dashboard', { replace: true });
  }, [hasDashboard, navigate, session.role, session.token]);

  useEffect(() => {
    if (!session.token || hasDashboard) return;
    if (!isOnline) {
      setIsLoading(false);
      return;
    }
    const load = async () => {
      try {
        const publicSettings = await loadPublicSettingsCached({ refresh: true })
          .catch(() => cachedSettings || ({ storeEnabled: false }));
        setSettings(publicSettings);
      } catch (error) {
        toast({ title: 'تعذر تحميل البيانات', description: error.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [cachedSettings, hasDashboard, isOnline, session.role, session.studentId, session.token, toast]);

  useEffect(() => {
    if (!isOnline) { setPermissionsReady(true); return; }
    if (!['supervisor', 'admin'].includes(session.role) || !session.supervisorId || hasDashboard) return;
    studentsApi.getMyDashboardPermissions()
      .then((data) => {
        const permissions = data.permissions || [];
        storeDashboardPermissions(permissions);
        if (permissions.length > 0) navigate('/dashboard', { replace: true });
      })
      .catch(() => undefined)
      .finally(() => setPermissionsReady(true));
  }, [hasDashboard, isOnline, navigate, session.role, session.supervisorId]);

  const staffAttendanceActive = settings.staffAttendanceSource === 'teacher' && session.role === 'supervisor' && !hasDashboard;
  const staffAttendanceState = useStaffAttendance(staffAttendanceActive);
  const { alreadyPresentToday } = staffAttendanceState;
  const waitingForAttendance = staffAttendanceActive && !staffAttendanceState.attendance && !staffAttendanceState.error;

  const sections = useMemo(() => {
    const list = [];
    if (session.role === 'student') return studentPortalSections({ isOnline, site, settings });
    if (session.role === 'supervisor') return supervisorPortalSections({ settings, alreadyPresentToday });
    return list;
  }, [alreadyPresentToday, isOnline, session.role, settings.staffAttendanceSource, settings.storeEnabled, settings.teacherManualPointsEnabled, site.features]);

  const requestedSection = ['quran-sessions', 'quran-saved'].includes(sectionSlug) && session.role === 'student'
    ? 'quranSessions' : portalSectionRoutes.getKey(sectionSlug);
  const _resolveActiveSection = () => {
    if (requestedSection === 'mushaf' && session.role === 'student') {
      return 'mushaf';
    }
    if (sections.some((section) => section.key === requestedSection)) {
      return requestedSection;
    }
    return defaultAccountSection(session.role, sections);
  };
  const activeSection = _resolveActiveSection();

  useEffect(() => {
    if (!session.token || hasDashboard || isLoading || waitingForAttendance || !activeSection || !permissionsReady) return;
    const canonicalSlug = portalSectionRoutes.getSlug(activeSection);
    if (sectionSlug !== canonicalSlug) {
      navigate(`/portal/${canonicalSlug}`, { replace: true });
    }
  }, [activeSection, hasDashboard, isLoading, waitingForAttendance, permissionsReady, navigate, sectionSlug, session.token]);

  const updateStoreBalance = useCallback((balance) => setStoreBalance(Number(balance || 0)), []);

  const changeSection = (key) => {
    if (key === 'mushaf' && activeSection !== key) {
      sessionStorage.setItem(`nukhab_${key}_return_section`, activeSection);
    }
    const slug = portalSectionRoutes.getSlug(key);
    if (slug) navigate(`/portal/${slug}`);
  };

  const leaveMushaf = () => {
    const returnSection = sessionStorage.getItem('nukhab_mushaf_return_section');
    const target = sections.find((section) => section.key === returnSection && section.key !== 'mushaf')
      || sections.find((section) => section.key !== 'mushaf');
    if (target) {
      changeSection(target.key);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else navigate('/', { replace: true });
  };

  const logout = useAccountLogout();

  const renderSection = () => {
    if (isLoading) return <DashboardLoader className="min-h-[420px]" />;
    const offlineStaffSections = new Set([
      'quranEvaluation',
      'previousRecitationSessions',
      'staffAttendance',
      'studentPlans',
    ]);
    if (!isOnline && session.role !== 'student' && !offlineStaffSections.has(activeSection)) {
      return <OfflineConnectionRequired />;
    }
    // Select the requested view without evaluating unrelated page branches.
    switch (activeSection) {
      case 'mushaf': return <StudentMushafSection studentId={session.studentId} />;
      case 'quranSessions': return <StudentPlanPanel onPointsChange={setPlanPoints} studentId={session.studentId} onOpenAmount={(target) => {
      setReaderTarget(target);
      changeSection('mushaf');
    }} />;
      case 'store': return <StudentStoreSection onBalanceChange={updateStoreBalance} />;
      case 'staffAttendance': return <StaffAttendanceSection attendanceState={staffAttendanceState} />;
      case 'quranEvaluation': return <TeacherEvaluationDialog supervisorId={session.supervisorId} inline />;
      case 'previousRecitationSessions': return <TeacherPreviousSessionsPanel />;
      case 'studentPlans': return <StudentPlansSection hideCommitteeFilter />;
      case 'teacherPoints': return <TeacherPointsAdjustmentSection />;
      case 'teacherReports': return (
          <ReportsSection
            teacherScoped
            canViewStandardReports
            canViewTeacherPoints={settings.teacherManualPointsEnabled}
          />
      );
      case 'calls': return <LazyCallsSection />;
    }
    return (
      <Card className="border-primary/30 bg-card">
        <CardContent className="p-8 text-muted-foreground">لا توجد أزرار متاحة حالياً.</CardContent>
      </Card>
    );
  };

  if (!session.token || hasDashboard) return null;

  if (isLoading || waitingForAttendance || !permissionsReady) {
    return (
      <div className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-[#002d29] [font-family:var(--font-ui)]" dir="rtl">
        <DashboardLoader mode="screen" className="h-dvh" />
      </div>
    );
  }

  if (activeSection === 'mushaf') {
    return (
      <div className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-background [font-family:var(--font-ui)]" dir="rtl">
        <PageLoadingBoundary key={activeSection}><Suspense fallback={<DashboardLoader mode="screen" className="h-dvh" />}>
          <StudentMushafSection studentId={session.studentId} onBack={leaveMushaf} initialTarget={readerTarget} />
        </Suspense></PageLoadingBoundary>
        <Toaster />
      </div>
    );
  }

  const _resolveHeaderContent = () => {
    if (session.role === 'student') {
      return <div className="flex items-center gap-2" dir="rtl">
      <StudentNotificationButton />
      {activeSection === 'quranSessions' && planPoints !== null && <span aria-label={`إجمالي النقاط: ${planPoints}`} className="[font-family:var(--font-ui)]"><RankingPointsValue value={planPoints} iconClassName="h-5 w-5" /></span>}
      {activeSection === 'store' && <PointsValue value={storeBalance} className="h-10 rounded-xl border border-[#dfa33b]/30 bg-[#fff8e8] px-3 text-base shadow-sm dark:bg-[#dfa33b]/10" iconClassName="h-5 w-5" />}
    </div>;
    }
    if (activeSection === 'quranEvaluation') {
      return <><Suspense fallback={null}><RecitationSettingsButton staffId={session.supervisorId} /></Suspense><StudentNotificationButton showTrigger={false} /></>;
    }
    return <StudentNotificationButton />;
  };
  const headerContent = _resolveHeaderContent();

  return (
    <>
    <StaffAttendancePrompt active={staffAttendanceActive} attendanceState={staffAttendanceState} />
    <DashboardShell
      title={site.name}
      logo={site.markLogo || site.squareLogo || site.logo}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={changeSection}
      onLogout={logout}
      headerContent={headerContent}
      replaceHeaderTitle={session.role === 'student' && activeSection === 'quranSessions'}
      showSectionTitle={session.role !== 'student' || activeSection !== 'quranSessions'}
    >
      <Suspense fallback={<DashboardLoader className="min-h-[420px]" />}>
        {renderSection()}
      </Suspense>
    </DashboardShell>
    </>
  );
};

export default AccountPortal;

/** Build the available student destinations for online and offline use. */
function studentPortalSections({ isOnline, site, settings }) {
  const list = [];

      if (!isOnline) {
        list.push({ key: 'quranSessions', label: 'خطتي', icon: CalendarDays });
        if (site.features?.store !== false && settings.storeEnabled) {
          list.push({ key: 'store', label: 'المتجر', icon: ShoppingBag });
        }
        return list;
      }
      list.push({ key: 'quranSessions', label: 'خطتي', icon: CalendarDays });
      if (site.features?.store !== false && settings.storeEnabled) {
        list.push({ key: 'store', label: 'المتجر', icon: ShoppingBag });
      }
      list.push({ key: 'calls', label: 'المكالمات', icon: PhoneCall });
    
  return list;
}

/** Build supervisor destinations using current attendance and feature settings. */
function supervisorPortalSections({ settings, alreadyPresentToday }) {
  const list = [];

      if (settings.staffAttendanceSource === 'teacher' && !alreadyPresentToday) {
        list.push({ key: 'staffAttendance', label: 'التحضير', icon: ClipboardCheck });
      }
      list.push({ key: 'quranEvaluation', label: 'جلسات التسميع', icon: ClipboardCheck },
        { key: 'previousRecitationSessions', label: 'جلسات التسميع السابقة', icon: History });
      if (settings.teacherManualPointsEnabled) list.push({ key: 'teacherPoints', label: 'الإضافة والخصم', icon: PlusCircle });
      list.push({ key: 'teacherReports', label: 'إحصائيات الحلقة', icon: BarChart3 });
      list.push({ key: 'calls', label: 'المكالمات', icon: PhoneCall },
        { key: 'studentPlans', label: 'خطط الطلاب', icon: ListChecks });
    
  return list;
}
