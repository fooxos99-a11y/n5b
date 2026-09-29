import { useEffect, useState } from 'react';
import { getApiBase } from '@/services/apiBase';

export const serverConnectivityChangeEvent = 'nukhab:server-connectivity-change';
let reachable = typeof navigator === 'undefined' ? true : navigator.onLine;
let activeProbe = null;
let probeInterval = null;
let listenerCount = 0;

const publish = (nextValue) => {
  if (reachable === nextValue) return;
  reachable = nextValue;
  window.dispatchEvent(new CustomEvent(serverConnectivityChangeEvent, { detail: nextValue }));
};

export const getServerReachability = () => reachable;

export const probeServerConnectivity = async () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    publish(false);
    return false;
  }
  if (activeProbe) return activeProbe;
  activeProbe = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${getApiBase()}/health`, {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });
      const available = response.ok || response.status === 429;
      publish(available);
      return available;
    } catch {
      publish(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
      activeProbe = null;
    }
  })();
  return activeProbe;
};

const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(reachable);

  useEffect(() => {
    const onConnectivity = (event) => setIsOnline(Boolean(event.detail));
    const onOffline = () => publish(false);
    const onOnline = () => void probeServerConnectivity();
    window.addEventListener(serverConnectivityChangeEvent, onConnectivity);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void probeServerConnectivity();
    listenerCount += 1;
    if (!probeInterval) {
      probeInterval = window.setInterval(() => void probeServerConnectivity(), 15000);
    }
    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      if (listenerCount === 0 && probeInterval) {
        window.clearInterval(probeInterval);
        probeInterval = null;
      }
      window.removeEventListener(serverConnectivityChangeEvent, onConnectivity);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
};

export default useOnlineStatus;
