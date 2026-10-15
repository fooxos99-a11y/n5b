import { useCallback, useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, screenStyles } from '../components/ScreenLayout';
import { DashboardButton } from '../components/dashboard/DashboardButton';
import { DashboardIcon } from '../components/dashboard/DashboardIcon';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { ManagementEmpty, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { NarrationCreateDialog } from '../components/narration/NarrationCreateDialog';
import { NarrationStudentDialog } from '../components/narration/NarrationStudentDialog';
import { filterNarrationPupils, newNarrationDraft, narrationGroups, type NarrationEntry, type NarrationEvent,
  type NarrationPayload, type NarrationPreview } from '../domain/narrationManagement';
import type { NarrationManagementApi, NarrationManagementData } from '../services/narrationManagementApi';
import { NativeApiError } from '../services/nativeApi';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { usePalette } from '../theme';

type NarrationAction = { kind: 'archive'; event: NarrationEvent; committeeId: number | null } | { kind: 'delete'; event: NarrationEvent };
export function NarrationManagementScreen({ api, onBack }: { api: NarrationManagementApi; onBack: () => void }) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const lastLoad = useRef<NarrationManagementData | null>(null); const reconciledLoad = useRef<NarrationManagementData | null>(null);
  const loader = useCallback(async (signal: AbortSignal) => { const result = await api.load(signal); lastLoad.current = result; return result; }, [api]); const resource = useLoadedResource(loader);
  const [selectedId, setSelectedId] = useState<number | null>(null); const selectedEventId = useRef<number | null>(null);
  const selectEvent = useCallback((id: number | null) => { selectedEventId.current = id; setSelectedId(id); }, []);
  const detailLoader = useCallback((signal: AbortSignal) => selectedId ? api.loadEvent(selectedId, signal) : Promise.resolve(null), [api, selectedId]);
  const detailResource = useLoadedResource(detailLoader); const data = resource.value;
  const event = selectedId !== null && detailResource.value?.id === selectedId ? detailResource.value : null;
  const [createOpen, setCreateOpen] = useState(false); const [draft, setDraft] = useState(() => api.readDraft()); const [student, setStudent] = useState<NarrationEntry | null>(null);
  const [choice, setChoice] = useState<'open' | 'archives' | 'archive-circle' | null>(null); const [search, setSearch] = useState('');
  const [action, setAction] = useState<NarrationAction | null>(null); const [stale, setStale] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const reloadList = resource.reload, reloadDetail = detailResource.reload;
  const reload = useCallback(async () => {
    const loaded = await reloadList(); if (!loaded) return false;
    if (lastLoad.current?.reconciled?.kind === 'create') { selectEvent(lastLoad.current.reconciled.eventId); return true; }
    if (lastLoad.current?.reconciled?.kind === 'delete' && selectedEventId.current === lastLoad.current.reconciled.eventId) { selectEvent(null); return true; }
    // A completed create can change selection while this callback still holds the prior detail loader.
    if (selectedEventId.current !== selectedId) return true;
    if (selectedId && lastLoad.current?.events.some(row => row.id === selectedId)) return reloadDetail();
    return true;
  }, [reloadList, reloadDetail, selectedId, selectEvent]);
  const mutation = useVerifiedMutation(reload); const { busy, uncertain } = mutation; const needsRefresh = uncertain || stale || api.hasUncertainOperation();
  const loading = resource.loading || (selectedId !== null && (detailResource.loading || (!event && !detailResource.error)));
  const error = resource.error || (selectedId ? detailResource.error : '');
  const blocked = loading || !!error || busy || needsRefresh;
  useEffect(() => {
    const isNewReconciliation = data !== reconciledLoad.current && !!data?.reconciled;
    if (isNewReconciliation && data?.reconciled?.kind === 'create') { reconciledLoad.current = data; selectEvent(data.reconciled.eventId); setDraft(newNarrationDraft()); }
    else if (isNewReconciliation && data?.reconciled?.kind === 'delete') { reconciledLoad.current = data; if (selectedEventId.current === data.reconciled.eventId) selectEvent(null); }
    else if (!selectedId && data?.events.some(row => row.status === 'open')) selectEvent(data.events.find(row => row.status === 'open')!.id);
  }, [data, selectedId, selectEvent]);
  function closeDialogs() { setCreateOpen(false); setAction(null); setStudent(null); setChoice(null); setStale(false); mutation.reset(); }
  function close() { if (busy) return; if (needsRefresh) void mutation.reconcile(closeDialogs); else closeDialogs(); }
  function refresh() { if (busy) return; if (needsRefresh) void mutation.reconcile(closeDialogs); else { setStudent(null); void reload(); } }
  async function create(payload: NarrationPayload, preview: NarrationPreview) {
    if (blocked) return;
    await mutation.run(async () => { try { const result = await api.create(payload, preview); selectEvent(result.id); return result; }
      catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setStale(true); throw cause; }
    }, () => { closeDialogs(); setDraft(newNarrationDraft()); }, value => {
      const queued = typeof value === 'object' && value !== null && 'messageQueued' in value && value.messageQueued === true;
      return queued ? 'حُفظ يوم السرد وأُضيف إرسال البداية للمعالجة. لم تُتحقق نتيجة التسليم.' : 'حُفظ يوم السرد. لم تُتحقق نتيجة إرسال الرسائل.';
    });
  }
  async function perform() {
    if (!action || busy || needsRefresh) return;
    if (!event || action.event.id !== selectedEventId.current || action.event.id !== event.id) { setStale(true); return; }
    const current = action;
    await mutation.run(async () => { try {
      if (current.kind === 'archive') return await api.archive(current.event, current.committeeId);
      await api.deleteArchive(current.event); selectEvent(null);
    } catch (cause) { if (cause instanceof NativeApiError && cause.code === 'conflict') setStale(true); throw cause; }
    }, closeDialogs, () => current.kind === 'archive' ? 'تحققت أرشفة الطلاب المحددين. لم تُتحقق نتيجة إرسال رسالة النهاية.' : 'حُذف الأرشيف وأُزيلت نقاط السرد المرتبطة به.');
  }
  const openEvents = data?.events.filter(row => row.status === 'open') ?? []; const archives = data?.events.filter(row => row.status === 'archived') ?? [];
  const visible = event?.students.filter(row => event.status === 'archived' || !row.archivedAt) ?? []; const rows = filterNarrationPupils(visible, search);
  const targets = action?.kind === 'archive' ? action.event.students.filter(row => !row.archivedAt && (action.committeeId === null || row.committeeId === action.committeeId)) : [];
  const archiveCircles = action?.kind === 'archive' ? [...new Map(action.event.students.filter(row => !row.archivedAt && row.committeeId !== null).map(row => [String(row.committeeId), { value: String(row.committeeId), label: row.committeeName }])).values()] : [];
  return <ScreenLayout title="يوم السرد" onBack={() => { if (!busy) onBack(); }} loading={loading} error={error} onRetry={refresh}>
    <View style={{ flexDirection: 'row-reverse', gap: width < 640 ? 6 : 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {width >= 640 ? <ActionButton label="فتح" accessibilityLabel="فتح يوم سرد" icon="plus" disabled={blocked} onPress={() => { mutation.reset(); setCreateOpen(true); }} />
        : <DashboardButton label="فتح يوم سرد" icon="plus" iconOnly selected disabled={blocked} onPress={() => { mutation.reset(); setCreateOpen(true); }} />}
      {event?.status === 'archived' && !!openEvents.length && <DashboardButton label="العودة للسرد الحالي" icon="refresh" iconOnly={width < 1024} outlined disabled={blocked}
        onPress={() => { setStudent(null); selectEvent(openEvents[0]!.id); setSearch(''); }} />}
      {event?.status === 'open' && (width >= 1024 ? <ActionButton label="إنهاء" accessibilityLabel="إنهاء يوم السرد" icon="checkCircle" tone="destructive" disabled={blocked}
        onPress={() => { mutation.reset(); setAction({ kind: 'archive', event, committeeId: null }); }} />
        : <DashboardButton label="إنهاء يوم السرد" icon="checkCircle" iconOnly outlined tone="destructive" disabled={blocked}
          onPress={() => { mutation.reset(); setAction({ kind: 'archive', event, committeeId: null }); }} />)}
      <DashboardButton label="أرشيف أيام السرد" icon="archive" iconOnly={width < 1024} outlined disabled={blocked || !archives.length} onPress={() => setChoice('archives')} />
      <DashboardButton label="تحديث بيانات السرد" icon="refresh" iconOnly outlined disabled={busy || resource.loading} onPress={refresh} />
      <DashboardButton label="خيارات السرد" icon="filter" iconOnly outlined disabled={busy} onPress={() => setOptionsOpen(true)} />
    </View>
    {!!mutation.error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{mutation.error}</AppText>}
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {!!data?.reconciled && <AppText accessibilityLiveRegion="polite">{data.reconciled.message}</AppText>}
    {needsRefresh && <AppText accessibilityRole="alert">توقفت العمليات حتى نتحقق من البيانات الحالية. لن تتكرر العملية عند التحديث.</AppText>}
    <ManagementPanel>
      {openEvents.length > 1 && <ManagementToolbar><DashboardSelect label="اختيار يوم سرد" value={event?.status === 'open' ? event.name : 'اختر يوم السرد'} grow
        disabled={blocked} onPress={() => setChoice('open')} /></ManagementToolbar>}
      {!!event && !loading && !error && <>
        <View style={{ padding: width < 640 ? 16 : 24, flexDirection: width < 640 ? 'column' : 'row-reverse', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderColor: palette.border }}>
          <View style={{ flex: 1, minWidth: 0 }}><AppText numberOfLines={1} style={{ fontFamily: 'CairoBlack', fontSize: 18, lineHeight: 28 }}>{event.name}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 14, marginTop: 4 }}>{formatHijriDate(event.startDate)} إلى {formatHijriDate(event.endDate)}</AppText></View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 16 }}>
            <View accessibilityLabel={`إجمالي الطلاب: ${visible.length}`} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
              <DashboardIcon name="supervisors" size={16} color={palette.muted} /><AppText style={{ fontFamily: 'CairoBlack', fontSize: 14, color: palette.muted }}>{visible.length}</AppText></View>
            <View accessibilityLabel={`أكمل: ${visible.filter(row => row.status === 'completed').length}`} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
              <DashboardIcon name="checkCircle" size={16} color={palette.primary} /><AppText style={{ fontFamily: 'CairoBlack', fontSize: 14, color: palette.primary }}>{visible.filter(row => row.status === 'completed').length}</AppText></View>
            {event.status === 'archived' && <ActionButton label="حذف الأرشيف" accessibilityLabel="حذف أرشيف السرد" icon="delete" tone="destructive" secondary disabled={blocked}
              onPress={() => { mutation.reset(); setAction({ kind: 'delete', event }); }} />}
          </View>
        </View>
        {event.status === 'archived' && <View style={{ flexDirection: 'row-reverse', padding: width < 640 ? 16 : 24, borderBottomWidth: 1, borderColor: palette.border }}>
          {[{ label: 'إجمالي الطلاب', value: visible.length, color: palette.primary }, { label: 'أكمل', value: visible.filter(row => row.status === 'completed').length, color: '#10b981' },
            { label: 'لم يكمل', value: visible.filter(row => row.status === 'in_progress').length, color: '#f59e0b' }].map(summary => <View key={summary.label} style={{ flex: 1, alignItems: 'center' }}>
            <AppText style={{ fontSize: 12, fontFamily: 'CairoBlack', color: palette.muted }}>{summary.label}</AppText>
            <AppText style={{ fontSize: 24, fontFamily: 'CairoBlack', color: summary.color, marginTop: 4 }}>{summary.value}</AppText></View>)}
        </View>}
        {rows.map(row => <ManagementRow key={row.id} title={row.name} subtitle={`${row.committeeName || 'بدون حلقة'} · ${narrationGroups(row).length} جزء`}
          actions={<ActionButton label="عرض" accessibilityLabel={`عرض نتائج ${row.name}`} icon={row.status === 'completed' ? 'checkCircle' : 'eye'}
            tone={row.status === 'completed' ? 'success' : 'default'} disabled={blocked} onPress={() => setStudent(row)} />} />)}
        {!rows.length && <ManagementEmpty>لا يوجد طلاب مطابقون.</ManagementEmpty>}
      </>}
      {!event && !loading && !error && <ManagementEmpty>لا يوجد يوم سرد مفتوح.</ManagementEmpty>}
    </ManagementPanel>
    <FormDialog visible={optionsOpen} title="خيارات السرد" busy={busy} onClose={() => setOptionsOpen(false)}>
      <FormField label="ابحث في طلاب يوم السرد" value={search} onChangeText={setSearch} editable={!blocked} />
      {!!event && <><AppText>المنشئ: {event.createdByName}</AppText><AppText>لم تُتحقق حالة تسليم الرسائل لهذا الحدث.</AppText></>}
    </FormDialog>
    <ChoiceDialog visible={choice === 'open' || choice === 'archives'} title={choice === 'archives' ? 'أرشيف أيام السرد' : 'اختيار يوم سرد'} value={selectedId ? String(selectedId) : undefined}
      options={(choice === 'archives' ? archives : openEvents).map(row => ({ value: String(row.id), label: `${row.name} — ${row.startDate}` }))}
      onChoose={value => { setStudent(null); selectEvent(Number(value)); setSearch(''); }} onClose={() => setChoice(null)} />
    {!!createOpen && !!data && <NarrationCreateDialog api={api} circles={data.circles} draft={draft} onChange={next => { api.keepDraft(next); setDraft(next); }} busy={busy} blocked={blocked} error={mutation.error}
      needsRefresh={needsRefresh} onRefresh={refresh} onCreate={(payload, preview) => { void create(payload, preview); }} onClose={close} />}
    {!!student && !!event && <NarrationStudentDialog api={api} event={event} student={student} onClose={() => setStudent(null)} />}
    {!!action && <FormDialog visible={choice !== 'archive-circle'} title={action.kind === 'archive' ? 'إنهاء يوم السرد' : 'حذف أرشيف السرد'} busy={busy} onClose={close}
      footer={<>{needsRefresh ? <ActionButton label="تحديث بيانات السرد" loading={busy} onPress={refresh} /> :
        <ActionButton label={action.kind === 'archive' ? 'تأكيد إنهاء السرد المحدد' : 'تأكيد حذف أرشيف السرد'} loading={busy} disabled={blocked} onPress={() => { void perform(); }} />}
        <ActionButton label="إلغاء" secondary disabled={busy} onPress={close} /></>}>
      {action.kind === 'archive' ? <>
        <AppText style={screenStyles.bold}>حدد الحلقات المراد إنهاء السرد عليها</AppText>
        <DashboardSelect label="الحلقات المراد إنهاء السرد عليها" value={action.committeeId === null ? 'جميع الحلقات' : archiveCircles.find(row => row.value === String(action.committeeId))?.label ?? 'الحلقة'} grow disabled={blocked} onPress={() => setChoice('archive-circle')} />
        <AppText>ستؤرشف نتائج {targets.length} طالبًا، منهم {targets.filter(row => row.status === 'completed').length} مكتملون. تنتهي الحلقة المحددة ويبقى الحدث مفتوحًا ما دامت له حلقات أخرى. لا يمكن إعادة فتح النتائج المؤرشفة.</AppText>
      </> : <AppText>سيُحذف يوم «{action.event.name}» ونتائجه ونقاط السرد المرتبطة به. لا يمكن التراجع عن هذا الحذف.</AppText>}
      {!!mutation.error && <AppText accessibilityRole="alert">{mutation.error}</AppText>}
    </FormDialog>}
    <ChoiceDialog visible={choice === 'archive-circle'} title="الحلقات المراد إنهاء السرد عليها" value={action?.kind === 'archive' ? String(action.committeeId ?? 'all') : 'all'}
      options={[{ value: 'all', label: 'كل الحلقات المتاحة' }, ...archiveCircles]} onChoose={value => setAction(current => current?.kind === 'archive' ? { ...current, committeeId: value === 'all' ? null : Number(value) } : current)} onClose={() => setChoice(null)} />
  </ScreenLayout>;
}
