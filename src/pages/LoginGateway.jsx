import { useStartup } from '@/components/startup/StartupProvider';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from '@/lib/router';
import { clearAuthSession, hasAuthSession, persistAuthSession } from '@/lib/authSession';
import { readStoredDashboardPermissions, storeDashboardPermissions } from '@/lib/dashboardPermissions';
import { studentsApi } from '@/services/studentsApi';
import { useSiteConfig } from '@/site/SiteProvider';
import { useAccountLogout } from '@/hooks/useAccountLogout';
import { loadPublicSettingsCached, readPublicSettingsCache } from '@/services/publicSettingsCache';

const AccountLoginPage = lazy(() => import('@/components/public/AccountLoginPage'));
const AccountDeletionDialog = lazy(() => import('@/components/account/AccountDeletionDialog'));
const StudentHome = lazy(() => import('@/components/portal/home/StudentHome'));

const redirectForUser = (user, navigate, studentHome) => {
  const permissions = user.dashboardPermissions || [];
  if (user.role === 'student') {
    navigate(studentHome ? '/' : '/portal', { replace: true });
    return;
  }
  if (user.role === 'manager' || (['supervisor', 'admin'].includes(user.role) && permissions.length > 0)) {
    navigate('/dashboard', { replace: true });
    return;
  }
  navigate('/portal', { replace: true });
};

const LoginGateway = ({ loginPage = false, deletionPage = false }) => {
  const site = useSiteConfig();
  const startup = useStartup();
  const navigate = useNavigate();
  const { toast } = useToast();
  const logout = useAccountLogout();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [featuresReady, setFeaturesReady] = useState(false);
  const [storedUser, setStoredUser] = useState(() => {
    const role = localStorage.getItem('wajeh_role') || '';
    if (role === 'platform_owner' || !hasAuthSession(role)) return null;
    return {
      role,
      id: role === 'student' ? localStorage.getItem('wajeh_student_id') || '' : '',
      name: localStorage.getItem('wajeh_name') || '',
      dashboardPermissions: readStoredDashboardPermissions(),
    };
  });
  useEffect(() => {
    if (storedUser && featuresReady) startup?.finish();
  }, [storedUser, featuresReady, startup]);
  useEffect(() => {
    if (!deletionPage && storedUser && (loginPage || storedUser.role !== 'student' || !site.features?.studentHome)) redirectForUser(storedUser, navigate, site.features?.studentHome);
  }, [deletionPage, loginPage, storedUser, navigate, site.features?.studentHome]);

  useEffect(() => {
    document.title = site.name;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', site.description || '');
  }, [site.description, site.name]);

  useEffect(() => {
    const role = localStorage.getItem('wajeh_role');
    if (role === 'platform_owner') {
      clearAuthSession();
      localStorage.removeItem('wajeh_role');
      localStorage.removeItem('wajeh_name');
      localStorage.removeItem('wajeh_account_id');
      localStorage.removeItem('wajeh_dashboard_permissions');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setFeaturesReady(false);
    // Refresh the public settings before showing the account; the cached copy stays usable offline.
    loadPublicSettingsCached({ refresh: true })
      .catch(() => readPublicSettingsCache())
      .finally(() => { if (active) setFeaturesReady(true); });
    return () => { active = false; };
  }, [storedUser?.id]);

  const handleLogin = async (loginNumber, password) => {
    if (!loginNumber) {
      toast({ title: 'أدخل رقم الحساب', variant: 'destructive' });
      return;
    }

    setIsLoggingIn(true);
    try {
      const user = await studentsApi.login({ loginNumber, password });
      await persistAuthSession(user.token);
      localStorage.setItem('wajeh_role', user.role);
      localStorage.setItem('wajeh_name', user.name || '');
      localStorage.setItem('wajeh_account_id', String(user.id || ''));
      localStorage.removeItem('wajeh_student_id');
      localStorage.removeItem('wajeh_supervisor_id');
      storeDashboardPermissions(user.dashboardPermissions || []);
      if (user.role === 'student') localStorage.setItem('wajeh_student_id', String(user.id));
      if (['supervisor', 'admin'].includes(user.role)) localStorage.setItem('wajeh_supervisor_id', String(user.id));
      window.dispatchEvent(new Event('nukhab-authenticated'));
      setStoredUser({ role: user.role, id: user.role === 'student' ? String(user.id) : '', name: user.name || '', dashboardPermissions: user.dashboardPermissions || [] });
      if (!deletionPage) redirectForUser(user, navigate, site.features?.studentHome);
    } catch (error) {
      toast({ title: 'تعذر الدخول', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (deletionPage && storedUser) return <Suspense fallback={null}><AccountDeletionDialog open onOpenChange={(open) => { if (!open) redirectForUser(storedUser, navigate, site.features?.studentHome); }} managedByPlatform={storedUser.role === 'manager'} /></Suspense>;

  if (loginPage || !storedUser) return <><Suspense fallback={<LoadingIndicator mode="screen" delayMs={0} />}>
    {storedUser ? <LoadingIndicator mode="screen" delayMs={0} /> : <AccountLoginPage site={site} onLogin={handleLogin} loading={isLoggingIn} />}
  </Suspense><Toaster /></>;

  if (!featuresReady) return <LoadingIndicator mode="screen" delayMs={0} />;

  return (
    <div className="min-h-[100svh] overflow-x-clip bg-background text-foreground [font-family:var(--font-ui)]" dir="rtl">
      {site.features?.studentHome && storedUser?.role === 'student' ? <Suspense fallback={<LoadingIndicator mode="screen" delayMs={0} />}>
        <StudentHome key={storedUser.id} studentId={storedUser.id} onLogout={() => { setStoredUser(null); logout(); }} />
      </Suspense> : <LoadingIndicator mode="screen" delayMs={0} />}
      <Toaster />
    </div>
  );
};

export default LoginGateway;
