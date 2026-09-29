import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import {
  prepareOfflineRecitationWorkspace,
  syncOfflineRecitations,
} from '@/services/offlineRecitationService';
import { syncOfflineStudent } from '@/services/offlineStudentService';
import { prefetchOfflineManagementWorkspace } from '@/services/offlineOperationsService';
import { getSiteConfig } from '@/site/siteConfigs';
import { serverConnectivityChangeEvent } from '@/hooks/useOnlineStatus';
import { getAuthSessionVersion, hasAuthSession } from '@/lib/authSession';

const getSupervisorId = () => {
  const role = localStorage.getItem('wajeh_role');
  if (role !== 'supervisor') return 0;
  return Number(localStorage.getItem('wajeh_supervisor_id') || 0);
};

const getStudentId = () => (
  localStorage.getItem('wajeh_role') === 'student'
    ? Number(localStorage.getItem('wajeh_student_id') || 0)
    : 0
);

const getManagementAccount = () => {
  const role = localStorage.getItem('wajeh_role') || '';
  if (!['manager', 'admin'].includes(role)) return { id: 0, role: '' };
  return { id: Number(localStorage.getItem('wajeh_account_id') || 0), role };
};

const OfflineRecitationSyncBridge = () => {
  useEffect(() => {
    let active = true;
    const run = async ({ bootstrap = false, force = false } = {}) => {
      const sessionVersion = getAuthSessionVersion();
      const isCurrent = () => active && hasAuthSession() && sessionVersion === getAuthSessionVersion();
      if (!isCurrent()) return;
      const supervisorId = getSupervisorId();
      const studentId = getStudentId();
      const management = getManagementAccount();
      if ((!supervisorId && !studentId && !management.id) || !active || navigator.onLine === false) return;
      if (supervisorId) await syncSupervisorOfflineWorkspace(supervisorId, force, bootstrap, isCurrent);
      if (!isCurrent()) return;
      if (studentId && (bootstrap || force || document.visibilityState === 'visible')) {
        await syncOfflineStudent(studentId, { force }).catch(() => undefined);
      }
      if (!isCurrent()) return;
      if (management.id && bootstrap) {
        await prefetchOfflineManagementWorkspace(management.id, management.role, { automatic: true }).catch(() => undefined);
      }
    };
    const consumeNativeWakeup = async () => {
      if (!Capacitor.isNativePlatform()) return;
      await BackgroundRunner.dispatchEvent({
        label: getSiteConfig().backgroundRunnerLabel,
        event: 'consumeNukhabOfflineRecitationWakeup',
        details: {},
      }).catch(() => undefined);
    };
    const onOnline = () => void run({ bootstrap: true });
    const onServerConnectivity = (event) => {
      if (event.detail) void run({ bootstrap: true });
    };
    const onFocus = () => void run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('nukhab-authenticated', onOnline);
    window.addEventListener(serverConnectivityChangeEvent, onServerConnectivity);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const onServiceWorkerMessage = (event) => {
      if (['NUKHAB_SYNC_OFFLINE_RECITATION', 'NUKHAB_SYNC_OFFLINE_OPERATIONS'].includes(event.data?.type)) {
        void run();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    void consumeNativeWakeup().then(() => run({ bootstrap: true }));
    const foregroundSyncInterval = window.setInterval(() => void run(), 60_000);

    let networkHandle;
    let appHandle;
    void Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected) void run({ bootstrap: true });
    }).then((handle) => { networkHandle = handle; });
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void consumeNativeWakeup().then(() => run());
    }).then((handle) => { appHandle = handle; });

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('nukhab-authenticated', onOnline);
      window.removeEventListener(serverConnectivityChangeEvent, onServerConnectivity);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      window.clearInterval(foregroundSyncInterval);
      void networkHandle?.remove();
      void appHandle?.remove();
    };
  }, []);

  return null;
};

export default OfflineRecitationSyncBridge;


/** Synchronize teacher data only while the original authenticated session remains active. */
async function syncSupervisorOfflineWorkspace(supervisorId, force, bootstrap, isCurrent) {
        await syncOfflineRecitations(supervisorId, { force }).catch(() => undefined);
        if (!isCurrent()) return;
        if (bootstrap) await prepareOfflineRecitationWorkspace(supervisorId, { automatic: true }).catch(() => undefined);
        if (!isCurrent()) return;
        if (bootstrap) await syncOfflineRecitations(supervisorId, { force }).catch(() => undefined);
      }
