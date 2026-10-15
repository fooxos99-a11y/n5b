import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { availableManagementSections, decodeDashboardFeatures, nativeRegistrationLink, type ManagementSection } from './domain/dashboardNavigation';
import { withVerifiedNativeExternalActivity, type NativeSession, type NativeSessionController } from './domain/nativeSession';
import { hasManagementGrant } from './domain/management';
import { useLoadedResource } from './hooks/useLoadedResource';
import { useAccountNotificationCount } from './hooks/useAccountNotificationCount';
import { createManagementApi } from './services/managementApi';
import { createRegistrationManagementApi } from './services/registrationManagementApi';
import { createStaffManagementApi } from './services/staffManagementApi';
import { createPlanManagementApi } from './services/planManagementApi';
import { createAttendanceManagementApi } from './services/attendanceManagementApi';
import { createSessionManagementApi } from './services/sessionManagementApi';
import { createDayCompensationApi } from './services/dayCompensationApi';
import { createNarrationManagementApi } from './services/narrationManagementApi';
import { createPassingManagementApi } from './services/passingManagementApi';
import { createReportManagementApi } from './services/reportManagementApi';
import { createStoreManagementApi } from './services/storeManagementApi';
import { createStudentStoreApi } from './services/studentStoreApi';
import { createStudentStoreStorage } from './services/studentStoreStorage';
import { createStudentStoreCoordinator } from './services/storePurchaseCoordinator';
import { pickStoreImage } from './services/storeImagePicker';
import { pickNewsImage } from './services/newsImagePicker';
import { createNewsManagementApi } from './services/newsManagementApi';
import { createNotificationsManagementApi, createAccountNotificationsApi } from './services/notificationsApi';
import { getAttendanceCoordinates } from './services/attendanceLocation';
import { AccountScreen } from './screens/AccountScreen';
import { CircleManagementScreen } from './screens/CircleManagementScreen';
import { RegistrationManagementScreen } from './screens/RegistrationManagementScreen';
import { StudentDashboardScreen } from './screens/StudentDashboardScreen';
import { StudentManagementScreen } from './screens/StudentManagementScreen';
import { SupervisorDashboardScreen } from './screens/SupervisorDashboardScreen';
import { StaffManagementScreen } from './screens/StaffManagementScreen';
import { PlanManagementScreen } from './screens/PlanManagementScreen';
import { AttendanceManagementScreen } from './screens/AttendanceManagementScreen';
import { SessionManagementScreen } from './screens/SessionManagementScreen';
import { NarrationManagementScreen } from './screens/NarrationManagementScreen';
import { PassingManagementScreen } from './screens/PassingManagementScreen';
import { ReportsManagementScreen } from './screens/ReportsManagementScreen';
import { StoreManagementScreen } from './screens/StoreManagementScreen';
import { StudentStoreScreen } from './screens/StudentStoreScreen';
import { NewsManagementScreen } from './screens/NewsManagementScreen';
import { NotificationsManagementScreen } from './screens/NotificationsManagementScreen';
import { AccountNotificationsScreen } from './screens/AccountNotificationsScreen';
import { ManagementShell } from './components/dashboard/ManagementShell';

type Route = 'account' | 'workspace' | 'notificationsInbox' | ManagementSection;
async function copyRegistrationLink(link: string): Promise<void> {
  if (!await Clipboard.setStringAsync(link)) throw new Error('تعذّر نسخ الرابط. استخدم المشاركة أو حدّد الرابط لنسخه.');
}
export function NativeDashboard({ session, controller, onLogout, onRefresh }: {
  session: NativeSession; controller: NativeSessionController; onLogout: () => void; onRefresh: () => void;
}) {
  const inManagementShell = session.role === 'manager' || session.role === 'admin';
  const [route, setRoute] = useState<Route>(['student', 'supervisor'].includes(session.role) ? 'workspace' : 'reports');
  const managementApi = useMemo(() => createManagementApi(controller), [controller]);
  const registrationApi = useMemo(() => hasManagementGrant(session, 'registrationRequests')
    ? createRegistrationManagementApi(controller) : null, [controller, session]);
  const staffApi = useMemo(() => hasManagementGrant(session, 'supervisors') || hasManagementGrant(session, 'administrators')
    ? createStaffManagementApi(controller) : null, [controller, session]);
  const planApi = useMemo(() => hasManagementGrant(session, 'studentPlans') ? createPlanManagementApi(controller) : null, [controller, session]);
  const attendanceApi = useMemo(() => hasManagementGrant(session, 'manualAttendance') ? createAttendanceManagementApi(controller) : null, [controller, session]);
  const sessionApi = useMemo(() => hasManagementGrant(session, 'weeklySession') || hasManagementGrant(session, 'trackSession')
    ? createSessionManagementApi(controller) : null, [controller, session]);
  const compensationApi = useMemo(() => hasManagementGrant(session, 'weeklySession') || hasManagementGrant(session, 'trackSession')
    ? createDayCompensationApi(controller) : null, [controller, session]);
  const narrationApi = useMemo(() => hasManagementGrant(session, 'narrationDay') ? createNarrationManagementApi(controller) : null, [controller, session]);
  const passingApi = useMemo(() => hasManagementGrant(session, 'quranPassing') ? createPassingManagementApi(controller) : null, [controller, session]);
  const reportApi = useMemo(() => session.role === 'supervisor' || hasManagementGrant(session, 'reports') ? createReportManagementApi(controller) : null, [controller, session]);
  const storeApi = useMemo(() => hasManagementGrant(session, 'store') ? createStoreManagementApi(controller) : null, [controller, session]);
  const newsApi = useMemo(() => hasManagementGrant(session, 'settings') ? createNewsManagementApi(controller) : null, [controller, session]);
  const notificationsApi = useMemo(() => hasManagementGrant(session, 'notifications')
    ? createNotificationsManagementApi(controller, { uuid: () => Crypto.randomUUID() }) : null, [controller, session]);
  const accountNotificationsApi = useMemo(() => createAccountNotificationsApi(controller), [controller]);
  const notificationUnreadCount = useAccountNotificationCount(accountNotificationsApi, route);
  const studentStoreApi = useMemo(() => session.role === 'student' ? createStudentStoreApi(controller) : null, [controller, session]);
  const storeStorage = useMemo(() => createStudentStoreStorage(), []);
  const storeCoordinator = useMemo(() => studentStoreApi ? createStudentStoreCoordinator(studentStoreApi, storeStorage,
    { owner: controller, uuid: () => Crypto.randomUUID() }) : null, [controller, studentStoreApi, storeStorage]);
  const loadFeatures = useCallback((signal: AbortSignal) => controller.request('/public-settings', { signal },
    value => decodeDashboardFeatures(value, session.role)), [controller, session]);
  const features = useLoadedResource(loadFeatures);
  const sections = features.value && !features.error ? availableManagementSections(session, features.value) : [];
  const homeRoute = session.role === 'student' || session.role === 'supervisor' ? 'workspace' : 'account';
  const backToHome = useCallback(() => setRoute(homeRoute), [homeRoute]);
  const pickVerifiedStoreImage = useCallback(() => withVerifiedNativeExternalActivity(controller, pickStoreImage), [controller]);
  const pickVerifiedNewsImage = useCallback(() => withVerifiedNativeExternalActivity(controller, pickNewsImage), [controller]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === homeRoute) return false; setRoute(homeRoute); return true;
    });
    return () => listener.remove();
  }, [route, homeRoute]);
  const sectionAllowed = sections.some(section => section.key === route);
  const renderScreen = () => {
  if (route === 'notificationsInbox') return <AccountNotificationsScreen api={accountNotificationsApi} onBack={backToHome} />;
  if (route === 'workspace' && session.role === 'student') return <StudentDashboardScreen controller={controller} onLogout={onLogout} onAccount={() => setRoute('account')}
    notificationUnreadCount={notificationUnreadCount} onNotifications={() => setRoute('notificationsInbox')}
    onStore={sections.some(section => section.key === 'store') ? () => setRoute('store') : undefined} />;
  if (route === 'workspace' && session.role === 'supervisor') return <SupervisorDashboardScreen session={session} controller={controller}
    onLogout={onLogout} onBack={() => setRoute('account')} getCoordinates={getAttendanceCoordinates} />;
  if (route === 'students' && sectionAllowed) return <StudentManagementScreen api={managementApi} onBack={backToHome} />;
  if (route === 'families' && sectionAllowed) return <CircleManagementScreen api={managementApi} onBack={backToHome} />;
  if ((route === 'supervisors' || route === 'administrators') && sectionAllowed && staffApi)
    return <StaffManagementScreen key={route} api={staffApi} mode={route} onBack={backToHome} />;
  if (route === 'studentPlans' && sectionAllowed && planApi) return <PlanManagementScreen api={planApi} onBack={backToHome} />;
  if (route === 'manualAttendance' && sectionAllowed && attendanceApi) return <AttendanceManagementScreen api={attendanceApi} onBack={backToHome} />;
  if ((route === 'weeklySession' || route === 'trackSession') && sectionAllowed && sessionApi)
    return <SessionManagementScreen key={route} api={sessionApi} compensationApi={compensationApi ?? undefined}
      component={route === 'weeklySession' ? 'weekly' : 'track'} onBack={backToHome} />;
  if (route === 'narrationDay' && sectionAllowed && narrationApi) return <NarrationManagementScreen api={narrationApi} onBack={backToHome} />;
  if (route === 'quranPassing' && sectionAllowed && passingApi) return <PassingManagementScreen api={passingApi} onBack={backToHome} />;
  if (route === 'reports' && sectionAllowed && reportApi) return <ReportsManagementScreen api={reportApi} onBack={backToHome} />;
  if (route === 'news' && sectionAllowed && newsApi) return <NewsManagementScreen api={newsApi} onBack={backToHome} pickImage={pickVerifiedNewsImage} />;
  if (route === 'notifications' && sectionAllowed && notificationsApi)
    return <NotificationsManagementScreen api={notificationsApi} onBack={backToHome} />;
  if (route === 'store' && sectionAllowed && session.role === 'student' && storeCoordinator)
    return <StudentStoreScreen coordinator={storeCoordinator} onBack={backToHome} />;
  if (route === 'store' && sectionAllowed && storeApi) return <StoreManagementScreen api={storeApi} onBack={backToHome}
    pickImage={pickVerifiedStoreImage} />;
  if (route === 'registrationRequests' && sectionAllowed && registrationApi) return <RegistrationManagementScreen api={registrationApi} session={session}
    registrationLink={nativeRegistrationLink(session.complex.registrationNumber)} onCopyLink={copyRegistrationLink} onBack={backToHome} />;
  return <AccountScreen session={session} onLogout={onLogout} onRefresh={onRefresh} refreshing={features.loading} error={features.error}
    sections={inManagementShell ? [] : sections} onSection={setRoute} onNotifications={inManagementShell ? undefined : () => setRoute('notificationsInbox')}
    onWorkspace={['student', 'supervisor'].includes(session.role) ? () => setRoute('workspace') : undefined} />;
  };
  if (!inManagementShell) return renderScreen();
  return <ManagementShell sections={sections} activeKey={sectionAllowed || route === 'notificationsInbox' ? route : 'account'}
    notificationUnreadCount={notificationUnreadCount}
    accountTitle={session.role === 'manager' ? 'حساب المدير' : 'حساب الإداري'} onChoose={setRoute}
    onNotifications={() => setRoute('notificationsInbox')} onLogout={onLogout}>{renderScreen()}</ManagementShell>;
}
