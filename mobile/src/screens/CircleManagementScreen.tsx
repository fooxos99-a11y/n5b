import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, screenStyles } from '../components/ScreenLayout';
import type { CircleStudent, ManagedCircle, ManagedComplex } from '../domain/management';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import type { ManagementApi } from '../services/managementApi';
import { usePalette } from '../theme';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { ManagementTabs } from '../components/dashboard/ManagementTabs';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';

export function CircleManagementScreen({ api, onBack }: { api: ManagementApi; onBack: () => void }) {
  const palette = usePalette(); const loader = useCallback((signal: AbortSignal) => api.loadCircles(signal), [api]); const resource = useLoadedResource(loader);
  const [tab, setTab] = useState<'circles' | 'complexes'>('circles'); const [search, setSearch] = useState(''); const [complexFilter, setComplexFilter] = useState('all');
  const [form, setForm] = useState<{ type: 'circle' | 'complex'; selected: ManagedCircle | ManagedComplex | null } | null>(null);
  const [name, setName] = useState(''); const [complexId, setComplexId] = useState(''); const [choice, setChoice] = useState<'filter' | 'form' | null>(null);
  const [deleting, setDeleting] = useState<ManagedCircle | null>(null); const [preview, setPreview] = useState<ManagedCircle | null>(null);
  const [previewRows, setPreviewRows] = useState<CircleStudent[]>([]); const [previewLoading, setPreviewLoading] = useState(false);
  const mutation = useVerifiedMutation(resource.reload); const { busy, error: mutationError, notice, uncertain } = mutation;
  const [previewError, setPreviewError] = useState('');
  const error = mutationError || previewError;
  const previewAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { previewAbort.current?.abort(); }, []);
  const circles = resource.value?.circles ?? []; const complexes = resource.value?.complexes ?? [];
  const filteredCircles: ManagedCircle[] = filterRosterByName(circles, search).filter((circle: ManagedCircle) => complexFilter === 'all' || circle.complexId === Number(complexFilter));
  const filteredComplexes: ManagedComplex[] = filterRosterByName(complexes, search);
  function edit(type: 'circle' | 'complex', selected: ManagedCircle | ManagedComplex | null) {
    setForm({ type, selected }); setName(selected?.name ?? ''); setComplexId(selected && 'complexId' in selected ? String(selected.complexId ?? '') : ''); mutation.reset(); setPreviewError('');
  }
  async function mutate(work: () => Promise<unknown>, close: () => void, success: (result: unknown) => string) {
    await mutation.run(work, close, success);
  }
  function closePreview() { previewAbort.current?.abort(); setPreview(null); setPreviewRows([]); setPreviewLoading(false); }
  async function showStudents(circle: ManagedCircle) {
    previewAbort.current?.abort(); const request = new AbortController(); previewAbort.current = request;
    setPreview(circle); setPreviewRows([]); setPreviewLoading(true); setPreviewError(''); mutation.reset();
    try { const rows = await api.circleStudents(circle.id, request.signal); if (!request.signal.aborted) setPreviewRows(rows); }
    catch (cause) { if (!request.signal.aborted) setPreviewError(cause instanceof Error ? cause.message : 'تعذّر تحميل الطلاب.'); }
    finally { if (!request.signal.aborted) setPreviewLoading(false); }
  }
  return <ScreenLayout title="المجمعات والحلقات" onBack={() => { closePreview(); onBack(); }} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    <ManagementPanel>
      <ManagementTabs label="المجمعات والحلقات" items={[{ key: 'complexes', label: 'المجمعات' }, { key: 'circles', label: 'الحلقات' }]}
        value={tab} onChoose={value => { setTab(value); setSearch(''); }} />
      <ManagementToolbar><View style={{ flex: 1, flexBasis: 224, minWidth: 0 }}><FormField hideLabel compact
        label={tab === 'circles' ? 'ابحث باسم الحلقة' : 'ابحث باسم المجمع'} placeholder={tab === 'circles' ? 'ابحث باسم الحلقة' : 'ابحث باسم المجمع'}
        value={search} onChangeText={setSearch} /></View>
      {tab === 'circles' && <DashboardSelect basis={160} label="المجمع" value={complexes.find(complex => String(complex.id) === complexFilter)?.name || 'كل المجمعات'}
        disabled={resource.loading || !!resource.error} onPress={() => setChoice('filter')} />}
        <ActionButton icon="plus" label={tab === 'circles' ? 'إضافة حلقة' : 'إضافة مجمع'} disabled={resource.loading || !!resource.error}
          onPress={() => edit(tab === 'circles' ? 'circle' : 'complex', null)} />
        {uncertain && <ActionButton label="تحديث القائمة" secondary disabled={busy || resource.loading} onPress={() => { void mutation.reconcile(() => {}); }} />}
      </ManagementToolbar>
      {!resource.loading && !resource.error && (tab === 'circles' ? filteredCircles.length ? filteredCircles.map(circle => <ManagementRow key={circle.id}
        title={circle.name} subtitle={`${circle.complexName || 'بدون مجمع'} · ${circle.studentsCount} طالب`} onOpen={() => edit('circle', circle)} disabled={busy}
        actions={<><ManagementIconButton icon="edit" label={`تعديل ${circle.name}`} disabled={busy} onPress={() => edit('circle', circle)} />
          <ManagementIconButton icon="eye" label={`طلاب ${circle.name}`} disabled={busy} onPress={() => { void showStudents(circle); }} />
          <ManagementIconButton icon="delete" label={`حذف ${circle.name}`} disabled={busy} onPress={() => { setDeleting(circle); mutation.reset(); setPreviewError(''); }} /></>} />)
        : <ManagementEmpty>لا توجد حلقات مطابقة.</ManagementEmpty>
        : filteredComplexes.length ? filteredComplexes.map(complex => <ManagementRow key={complex.id} title={complex.name} subtitle={`${complex.committeesCount} حلقات`}
          disabled={busy} onOpen={() => edit('complex', complex)} actions={<ManagementIconButton icon="edit" label={`تعديل ${complex.name}`} disabled={busy} onPress={() => edit('complex', complex)} />} />)
          : <ManagementEmpty>لا توجد مجمعات مطابقة.</ManagementEmpty>)}
    </ManagementPanel>
    <FormDialog visible={!!form} title={`${form?.selected ? 'تعديل' : 'إضافة'} ${form?.type === 'circle' ? 'حلقة' : 'مجمع'}`} busy={busy} onClose={() => {
      if (uncertain) void mutation.reconcile(() => setForm(null)); else setForm(null);
    }} footer={uncertain ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(() => setForm(null)); }} />
      : <ActionButton label="حفظ" loading={busy} onPress={() => {
        if (form) void mutate(() => form.type === 'circle' ? api.saveCircle(name, Number(complexId), complexes, form.selected?.id)
          : api.saveComplex(name, form.selected?.id), () => setForm(null), () => 'حُفظت البيانات.');
      }} />}>
      <FormField label={form?.type === 'circle' ? 'اسم الحلقة' : 'اسم المجمع'} value={name} maxLength={180} editable={!busy} onChangeText={setName} />
      {form?.type === 'circle' && <ActionButton label={`المجمع: ${complexes.find(complex => String(complex.id) === complexId)?.name || 'اختر المجمع'}`}
        secondary disabled={busy} onPress={() => setChoice('form')} />}
      {!!error && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    </FormDialog>
    <FormDialog visible={!!preview} title={`طلاب ${preview?.name ?? 'الحلقة'}`} busy={previewLoading} onClose={closePreview}>
      {previewLoading ? <AppText>جارٍ تحميل الطلاب</AppText> : error ? <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>
        : previewRows.length ? previewRows.map(student => <View key={student.id} style={[screenStyles.row, { borderColor: palette.border }]}>
          <AppText>{student.name}</AppText>{!!student.guardianPhone && <AppText>{student.guardianPhone}</AppText>}
        </View>) : <AppText>لا يوجد طلاب في الحلقة.</AppText>}
    </FormDialog>
    <ConfirmDialog visible={!!deleting} title="حذف الحلقة" message={`سيُحذف اسم ${deleting?.name ?? 'الحلقة'}. تبقى حسابات طلابها بلا حلقة حتى تنقلهم إلى حلقة أخرى.`}
      confirmLabel={uncertain ? 'تحديث البيانات للتحقق' : 'حذف الحلقة'} busy={busy} error={error} onClose={() => {
        if (uncertain) void mutation.reconcile(() => setDeleting(null)); else setDeleting(null);
      }} onConfirm={() => {
        if (uncertain) void mutation.reconcile(() => setDeleting(null));
        else if (deleting) void mutate(() => api.deleteCircle(deleting.id), () => setDeleting(null), result => `حُذفت الحلقة. عدد الطلاب الذين أصبحوا بلا حلقة: ${result}.`);
      }} />
    <ChoiceDialog visible={!!choice} title="اختر المجمع" options={[...(choice === 'filter' ? [{ value: 'all', label: 'كل المجمعات' }] : []),
      ...complexes.map(complex => ({ value: String(complex.id), label: complex.name }))]} value={choice === 'filter' ? complexFilter : complexId}
      onChoose={value => { if (choice === 'filter') setComplexFilter(value); else setComplexId(value); }} onClose={() => setChoice(null)} />
  </ScreenLayout>;
}
