import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { NotificationContent } from '../components/notifications/NotificationContent';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { useLoadedResource } from '../hooks/useLoadedResource';
import type { AccountNotificationsApi } from '../services/notificationsApi';
import { usePalette } from '../theme';

export function AccountNotificationsScreen({ api, onBack }: { api: AccountNotificationsApi; onBack: () => void }) {
  const viewKey = useSyncExternalStore(api.subscribe, api.viewKey, api.viewKey);
  return <AccountNotificationsContent key={viewKey} api={api} onBack={onBack} />;
}
function AccountNotificationsContent({ api, onBack }: { api: AccountNotificationsApi; onBack: () => void }) {
  const palette = usePalette(); const accessible = useSyncExternalStore(api.subscribe, api.canRead, api.canRead);
  const loader = useCallback((signal: AbortSignal) => api.load(signal), [api]); const resource = useLoadedResource(loader);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const sending = useRef(false), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const rows = resource.value ?? [], unread = rows.filter(row => !row.isRead);
  async function markRead(ids: string[]) {
    if (sending.current || !api.canRead()) return; sending.current = true; setBusy(true); setError('');
    try { await api.markRead(ids); if (live.current && api.canRead()) await resource.reload(); }
    catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة القراءة.'); }
    finally { sending.current = false; if (live.current) setBusy(false); }
  }
  return <ScreenLayout title="إشعارات الحساب" onBack={onBack} loading={accessible && resource.loading}
    error={accessible ? resource.error : 'تعذر الوصول إلى إشعارات الحساب.'} onRetry={accessible ? () => { void resource.reload(); } : undefined}>
    {accessible && <>{!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
      {!resource.loading && !resource.error && <SectionCard title={`الإشعارات (${unread.length} غير مقروء)`}>
        <View style={screenStyles.actions}><ActionButton label="تحديث الإشعارات" secondary disabled={busy} onPress={() => { void resource.reload(); }} />
          <ActionButton label="تعليم الكل كمقروء" disabled={busy || !unread.length} loading={busy} onPress={() => { void markRead(unread.map(row => row.id)); }} /></View>
        {!rows.length && <AppText>لا توجد إشعارات.</AppText>}
        {rows.map(item => <View key={item.id} style={[screenStyles.row, { borderColor: palette.border }]}><NotificationContent item={item} />
          {!item.isRead && <ActionButton label="تعليم كمقروء" accessibilityLabel={`تعليم ${item.title} كمقروء`} secondary disabled={busy}
            onPress={() => { void markRead([item.id]); }} />}</View>)}
      </SectionCard>}
    </>}
  </ScreenLayout>;
}
