import StartupProvider from '@/components/startup/StartupProvider';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import ScreenLoadingProvider from '@/components/ui/screen-loading-provider';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import LoadingScreen from '@/components/LoadingScreen';
import RouteThemeController from '@/components/RouteThemeController';
import LoginGateway from '@/pages/LoginGateway';

const AccountPortal = lazy(() => import('@/pages/AccountPortal'));
const WajehDashboard = lazy(() => import('@/pages/WajehDashboard'));
const PublicRegistration = lazy(() => import('@/pages/PublicRegistration'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('@/pages/TermsOfUse'));
const SupportPage = lazy(() => import('@/pages/SupportPage'));
const DownloadApp = lazy(() => import('@/pages/DownloadApp'));
const OfflineRecitationSyncBridge = lazy(() => import('@/components/native/OfflineRecitationSyncBridge'));

function App() {
  const [syncEnabled, setSyncEnabled] = useState(() => Boolean(localStorage.getItem('wajeh_role')));

  useEffect(() => {
    const enableSync = () => setSyncEnabled(Boolean(localStorage.getItem('wajeh_role')));
    window.addEventListener('nukhab-authenticated', enableSync);
    window.addEventListener('storage', enableSync);
    return () => {
      window.removeEventListener('nukhab-authenticated', enableSync);
      window.removeEventListener('storage', enableSync);
    };
  }, []);

  return (
    <AppErrorBoundary><StartupProvider><ScreenLoadingProvider>
      <RouteThemeController />
      {syncEnabled && (
        <Suspense fallback={null}><OfflineRecitationSyncBridge /></Suspense>
      )}
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
        <Route path="/" component={LoginGateway} />
        <Route path="/login"><LoginGateway loginPage /></Route>
        <Route path="/account-deletion"><LoginGateway deletionPage /></Route>
        <Route path="/register" component={PublicRegistration} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfUse} />
        <Route path="/support" component={SupportPage} />
        <Route path="/download" component={DownloadApp} />
        <Route path="/portal/:section?">{localStorage.getItem('wajeh_role') === 'student' ? <Redirect to="/" replace /> : <AccountPortal />}</Route>
        <Route path="/dashboard/:section?" component={WajehDashboard} />
        <Route path="/owner"><Redirect to="/" replace /></Route>
        <Route><Redirect to="/" replace /></Route>
        </Switch>
      </Suspense>
    </ScreenLoadingProvider></StartupProvider></AppErrorBoundary>
  );
}

export default App;
