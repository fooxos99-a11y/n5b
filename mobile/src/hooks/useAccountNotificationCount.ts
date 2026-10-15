import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { AccountNotificationsApi } from '../services/notificationsApi';
import { useLoadedResource } from './useLoadedResource';

export function useAccountNotificationCount(api: AccountNotificationsApi, refreshKey: string): number | undefined {
  const accessible = useSyncExternalStore(api.subscribe, api.canRead, api.canRead);
  const load = useCallback(async (signal: AbortSignal) => ({ api,
    count: (await api.load(signal)).filter(item => !item.isRead).length }), [api]);
  const resource = useLoadedResource(load);
  const previousKey = useRef(refreshKey);
  const { reload } = resource;
  useEffect(() => {
    if (previousKey.current === refreshKey) return;
    previousKey.current = refreshKey;
    void reload();
  }, [refreshKey, reload]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && api.canRead()) void reload();
    }, 45_000);
    return () => clearInterval(timer);
  }, [api, reload]);
  // Keep the last confirmed count during an outage, but never show another API scope's value.
  return accessible && resource.value?.api === api ? resource.value.count : undefined;
}
