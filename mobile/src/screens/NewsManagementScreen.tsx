import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { NewsEntryDialog } from '../components/news/NewsEntryDialog';
import { ScreenLayout } from '../components/ScreenLayout';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { emptyNewsDraft, newsAudienceLabel, newsDisplayStatus, newsDraft, normalizeNewsEntry, validateNewsImage,
  type NewsDraft, type NewsEntry } from '../domain/newsManagement';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { NativeApiError } from '../services/nativeApi';
import type { NewsManagementApi } from '../services/newsManagementApi';
import { usePalette } from '../theme';

interface Editor { api: NewsManagementApi; scopeKey: string; draft: NewsDraft; editing: boolean }
const denied = (cause: unknown): boolean => cause instanceof NativeApiError && (cause.status === 401 || cause.status === 403 || ['unauthorized', 'forbidden', 'cancelled'].includes(cause.code));
export function NewsManagementScreen({ api, onBack, pickImage }: { api: NewsManagementApi; onBack: () => void; pickImage: () => Promise<string | null> }) {
  const palette = usePalette(), apiRef = useRef(api); apiRef.current = api;
  const [deniedApi, setDeniedApi] = useState<NewsManagementApi | null>(null);
  const loader = useCallback(async (signal: AbortSignal) => {
    try { const data = await api.load(signal); if (!signal.aborted && apiRef.current === api) setDeniedApi(null); return { api, data }; }
    catch (cause) { if (!signal.aborted && apiRef.current === api && denied(cause)) setDeniedApi(api); throw cause; }
  }, [api]);
  const resource = useLoadedResource(loader), reloadResource = resource.reload;
  const reload = useCallback(async () => apiRef.current === api && (await reloadResource()) && !api.hasUncertainOperation(), [reloadResource, api]);
  const mutation = useVerifiedMutation(reload), [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<{ api: NewsManagementApi; scopeKey: string; entry: NewsEntry } | null>(null);
  const [validation, setValidation] = useState(''), [search, setSearch] = useState(''), [picking, setPicking] = useState(false), [outdated, setOutdated] = useState(false);
  const mounted = useRef(false), editorRef = useRef(editor); editorRef.current = editor;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeKey = api.scopeKey(); let active = deniedApi !== api; try { api.assertActive(); } catch { active = false; }
  const data = active && resource.value?.api === api && resource.value.data.scopeKey === scopeKey ? resource.value.data : null;
  const canShow = !!data && !resource.loading && !resource.error, uncertain = mutation.uncertain || api.hasUncertainOperation() || !!data?.uncertainOperation;
  const needsRefresh = uncertain || outdated, blocked = mutation.busy || picking || needsRefresh || !canShow;
  const activeEditor = active && editor?.api === api && editor.scopeKey === scopeKey ? editor : null;
  const activeDeletion = active && deleting?.api === api && deleting.scopeKey === scopeKey ? deleting : null;
  const error = mutation.error || validation;
  function closeAll() { setEditor(null); setDeleting(null); setValidation(''); setOutdated(false); mutation.reset(); }
  function closeDialog() { if (mutation.busy || picking) return; if (needsRefresh) void mutation.reconcile(closeAll); else closeAll(); }
  function refresh() { if (mutation.busy || picking) return; if (needsRefresh) void mutation.reconcile(closeAll); else { closeAll(); void resource.reload(); } }
  function open(entry?: NewsEntry) { if (blocked) return; closeAll(); setEditor({ api, scopeKey, draft: entry ? newsDraft(entry) : emptyNewsDraft(randomUUID()), editing: !!entry }); }
  function change(patch: Partial<NewsDraft>) { if (!blocked) setEditor(current => current?.api === api && current.scopeKey === scopeKey ? { ...current, draft: { ...current.draft, ...patch } } : current); }
  async function chooseImage() {
    if (!activeEditor || blocked) return; const target = activeEditor; setPicking(true); setValidation('');
    try {
      api.assertActive(); const image = await pickImage(); api.assertActive();
      if (mounted.current && image !== null && apiRef.current === api && editorRef.current === target && api.scopeKey() === target.scopeKey)
        setEditor({ ...target, draft: { ...target.draft, image: validateNewsImage(image) } });
    } catch (cause) {
      if (mounted.current && apiRef.current === api && editorRef.current === target) { if (denied(cause)) setDeniedApi(api); setValidation(cause instanceof Error ? cause.message : 'تعذّرت قراءة الصورة.'); }
    } finally { if (mounted.current) setPicking(false); }
  }
  async function persist(entries: readonly NewsEntry[], message: string) {
    if (blocked || !data) return; setValidation('');
    await mutation.run(async () => {
      try { return await api.saveEntries({ entries, expected: data }); }
      catch (cause) { if (mounted.current && apiRef.current === api) { if (denied(cause)) setDeniedApi(api); if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true); } throw cause; }
    }, closeAll, () => message);
  }
  function save() {
    if (!activeEditor || blocked || !data) return;
    try {
      const draft = { ...activeEditor.draft }; delete draft.legacyStudentIds;
      const entry = normalizeNewsEntry(draft), entries = activeEditor.editing ? data.entries.map(row => row.id === entry.id ? entry : row) : [...data.entries, entry];
      void persist(entries, 'حُفظ الخبر.');
    } catch (cause) { setValidation(cause instanceof Error ? cause.message : 'تحقق من بيانات الخبر.'); }
  }
  const query = search.trim().toLocaleLowerCase('ar'), entries = data?.entries.filter(row => `${row.title} ${row.body}`.toLocaleLowerCase('ar').includes(query)) ?? [];
  return <ScreenLayout title="الأخبار" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={refresh}>
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {!!error && !activeEditor && !activeDeletion && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    {uncertain && !mutation.error && <AppText accessibilityRole="alert">تعذّر تأكيد نتيجة التغيير. حدّث البيانات للتحقق قبل إجراء جديد.</AppText>}
    {needsRefresh && <ActionButton label="تحديث البيانات للتحقق" secondary disabled={mutation.busy || picking || resource.loading} onPress={refresh} />}
    <ManagementPanel><ManagementToolbar>
      <View style={{ flex: 1, minWidth: 0 }}><FormField label="ابحث في الأخبار" placeholder="ابحث في الأخبار" hideLabel compact
        value={canShow ? search : ''} editable={canShow} onChangeText={setSearch} /></View>
      <ActionButton label="إضافة خبر" icon="plus" disabled={blocked || (data?.entries.length ?? 8) >= 8} onPress={() => open()} />
    </ManagementToolbar>
    {canShow && data && <>
      {entries.map(entry => <ManagementRow key={entry.id} title={entry.title} image={entry.image}
        subtitle={`${newsAudienceLabel(entry, data.committees)}، ${newsDisplayStatus(entry)}`} disabled={blocked} onOpen={() => open(entry)}
        actions={<>
          <ManagementIconButton icon="edit" label={`تعديل ${entry.title}`} disabled={blocked} onPress={() => open(entry)} />
          <ManagementIconButton icon="delete" label={`حذف ${entry.title}`} disabled={blocked} onPress={() => { closeAll(); setDeleting({ api, scopeKey, entry }); }} />
        </>} />)}
      {!entries.length && <ManagementEmpty>{query ? 'لا توجد أخبار مطابقة للبحث.' : 'لا توجد أخبار حاليًا.'}</ManagementEmpty>}
    </>}
    </ManagementPanel>
    {activeEditor && <NewsEntryDialog draft={activeEditor.draft} editing={activeEditor.editing} committees={data?.committees ?? []} busy={mutation.busy} picking={picking}
      disabled={blocked} needsRefresh={needsRefresh} error={error} onChange={change} onPickImage={() => { void chooseImage(); }} onSave={save}
      onReconcile={() => { void mutation.reconcile(closeAll); }} onClose={closeDialog} />}
    <ConfirmDialog visible={!!activeDeletion} title="حذف الخبر؟" message={activeDeletion?.entry.title ?? ''} confirmLabel={needsRefresh ? 'تحديث البيانات للتحقق' : 'حذف الخبر'}
      busy={mutation.busy} error={error} confirmDisabled={!needsRefresh && blocked} onClose={closeDialog} onConfirm={() => {
        if (needsRefresh) { void mutation.reconcile(closeAll); return; }
        if (activeDeletion && data) void persist(data.entries.filter(row => row.id !== activeDeletion.entry.id), 'حُذف الخبر.');
      }} />
  </ScreenLayout>;
}
