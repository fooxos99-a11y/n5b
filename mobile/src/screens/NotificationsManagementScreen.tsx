import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { NotificationAudiencePicker } from '../components/notifications/NotificationAudiencePicker';
import { NotificationContent, NotificationRecipientRows } from '../components/notifications/NotificationContent';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { emptyNotificationSelection, selectedNotificationPeople, type NotificationDraft, type NotificationRecipient } from '../domain/notifications';
import { useLoadedResource } from '../hooks/useLoadedResource';
import type { NotificationsManagementApi } from '../services/notificationsApi';
import { brand, usePalette } from '../theme';
import { DashboardButton } from '../components/dashboard/DashboardButton';

export function NotificationsManagementScreen({ api, onBack }: { api: NotificationsManagementApi; onBack: () => void }) {
  const viewKey = useSyncExternalStore(api.subscribe, api.viewKey, api.viewKey);
  return <NotificationsManagementContent key={viewKey} api={api} onBack={onBack} />;
}
function NotificationsManagementContent({ api, onBack }: { api: NotificationsManagementApi; onBack: () => void }) {
  const palette = usePalette(); const accessible = useSyncExternalStore(api.subscribe, api.canManage, api.canManage);
  const loader = useCallback((signal: AbortSignal) => api.load(signal), [api]); const resource = useLoadedResource(loader);
  const [draft, setDraft] = useState<NotificationDraft>(() => api.canManage() ? api.pending()
    ?? { title: brand.name, body: '', selection: emptyNotificationSelection() } : { title: brand.name, body: '', selection: emptyNotificationSelection() });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false); const [recipientState, setRecipientState] = useState<{ id: number; rows: NotificationRecipient[]; loading: boolean; error: string } | null>(null);
  const live = useRef(true); const request = useRef<AbortController | null>(null); const sending = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; request.current?.abort(); }; }, []);
  const pending = useSyncExternalStore(api.subscribe, api.pendingSnapshot, api.pendingSnapshot);
  const audience = resource.value?.audience ?? { people: [], committees: [] };
  const blocked = busy || !!pending || resource.loading || !!resource.error || !accessible;
  const count = selectedNotificationPeople(audience, draft.selection).length;
  async function send(retry = false) {
    if (sending.current || !api.canManage()) return;
    sending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = retry ? await api.retryPending() : await api.send(draft, audience);
      if (!live.current || !api.canManage()) return;
      setDraft({ title: brand.name, body: '', selection: emptyNotificationSelection() });
      setNotice(result.duplicate ? 'تأكد حفظ الإشعار السابق داخل التطبيق.' : 'أُرسل الإشعار داخل التطبيق.'); await resource.reload();
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : 'تعذر إرسال الإشعار.'); }
    finally { sending.current = false; if (live.current) setBusy(false); }
  }
  async function showRecipients(id: number) {
    if (!api.canManage()) return; request.current?.abort(); const abort = new AbortController(); request.current = abort;
    setRecipientState({ id, rows: [], loading: true, error: '' });
    try { const rows = await api.loadRecipients(id, abort.signal);
      if (!abort.signal.aborted && live.current && api.canManage()) setRecipientState({ id, rows, loading: false, error: '' });
    } catch (cause) { if (!abort.signal.aborted && live.current) setRecipientState({ id, rows: [], loading: false,
      error: cause instanceof Error ? cause.message : 'تعذر تحميل المستلمين.' }); }
  }
  return <ScreenLayout title="إرسال الإشعارات" onBack={onBack} loading={accessible && resource.loading}
    error={accessible ? resource.error : 'ليست لديك صلاحية لعرض الإشعارات المرسلة.'} onRetry={accessible ? () => { void resource.reload(); } : undefined}>
    {accessible && <>{!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
      {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
      {!!pending && <SectionCard><AppText>لم تتأكد نتيجة الإرسال. حُفظ الطلب نفسه؛ تحقق منه قبل تعديل الرسالة أو المستلمين.</AppText>
        <ActionButton label="التحقق من الإرسال السابق" loading={busy} onPress={() => { void send(true); }} /></SectionCard>}
      {!resource.loading && !resource.error && <NotificationAudiencePicker audience={audience} selection={draft.selection} disabled={blocked}
        historyAction={<DashboardButton iconOnly outlined label="الإشعارات المرسلة" icon="history" disabled={busy} onPress={() => setHistoryOpen(true)} />}
        onChange={selection => { setDraft(current => ({ ...current, selection })); setError(''); setNotice(''); }}>
        <FormField label="نص الرسالة" accessibilityLabel="نص الإشعار" placeholder="اكتب الرسالة هنا..." value={draft.body} multiline maxLength={4000} editable={!blocked}
          onChangeText={body => { setDraft(current => ({ ...current, body })); setError(''); setNotice(''); }} />
        <View style={screenStyles.actions}><View style={{ flex: 1 }} /><ActionButton label="إرسال" icon="send" accessibilityLabel={`إرسال الإشعار (${count})`} disabled={blocked || !count || !draft.body.trim()} loading={busy}
          onPress={() => { void send(); }} /></View>
      </NotificationAudiencePicker>}
      <FormDialog visible={historyOpen} title="الإشعارات المرسلة" onClose={() => setHistoryOpen(false)}>
        {resource.value?.history.length === 0 && <AppText>لا توجد إشعارات مرسلة.</AppText>}
        {resource.value?.history.map(item => <View key={item.id} style={[screenStyles.row, { borderColor: palette.border }]}>
          <NotificationContent item={item} /><AppText>{item.createdBy}</AppText>
          <AppText>أُرسل داخل التطبيق: {item.recipientCount} · قُرئ: {item.readCount}</AppText>
          <AppText>إرسال الأجهزة: {item.pushSent} · بانتظار الإرسال: {item.pushPending} · تعذر الإرسال: {item.pushFailed}</AppText>
          <ActionButton label={`المستلمون للإشعار ${item.id}`} secondary onPress={() => { void showRecipients(item.id); }} />
        </View>)}
      </FormDialog>
      <FormDialog visible={recipientState !== null} title="المستلمون" onClose={() => { request.current?.abort(); setRecipientState(null); }}>
        {recipientState?.loading ? <AppText>جارٍ التحميل</AppText> : recipientState?.error ? <><AppText accessibilityRole="alert">{recipientState.error}</AppText>
          <ActionButton label="إعادة تحميل المستلمين" secondary onPress={() => { void showRecipients(recipientState.id); }} /></>
          : <NotificationRecipientRows rows={recipientState?.rows ?? []} />}
      </FormDialog>
    </>}
  </ScreenLayout>;
}
