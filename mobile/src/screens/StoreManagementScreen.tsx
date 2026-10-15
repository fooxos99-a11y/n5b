import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { formatPoints } from '../../../src/lib/pointsFormat.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ScreenLayout } from '../components/ScreenLayout';
import { StoreOrderRow } from '../components/store/StoreOrderRow';
import { StoreProductImage } from '../components/store/StoreProductImage';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { ManagementTabs } from '../components/dashboard/ManagementTabs';
import { StoreProductDialog } from '../components/store/StoreProductDialog';
import { StoreSettingsDialog } from '../components/store/StoreSettingsDialog';
import { emptyStoreProductDraft, normalizeStoreProductDraft, storeProductDraft,
  type StoreConfiguration, type StoreConfigurationPatch, type StoreOrder, type StoreOrderDecision,
  type StoreProduct, type StoreProductDraft } from '../domain/storeManagement';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import { NativeApiError } from '../services/nativeApi';
import type { StoreManagementApi } from '../services/storeManagementApi';
import { usePalette } from '../theme';

interface ProductEditor { api: StoreManagementApi; scopeKey: string; draft: StoreProductDraft; expected?: StoreProduct }
interface SettingsEditor { api: StoreManagementApi; scopeKey: string; configuration: StoreConfiguration }
function accessDenied(cause: unknown): boolean {
  return cause instanceof NativeApiError && (cause.status === 401 || cause.status === 403
    || ['unauthorized', 'forbidden', 'cancelled'].includes(cause.code));
}
export function StoreManagementScreen({ api, onBack, pickImage }: {
  api: StoreManagementApi; onBack: () => void; pickImage: () => Promise<string | null>;
}) {
  const palette = usePalette();
  const apiRef = useRef(api); apiRef.current = api;
  const [deniedApi, setDeniedApi] = useState<StoreManagementApi | null>(null);
  const loader = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await api.load(signal);
      if (!signal.aborted && apiRef.current === api) setDeniedApi(current => current === api ? null : current);
      return { api, data };
    } catch (cause) {
      if (!signal.aborted && apiRef.current === api && accessDenied(cause)) setDeniedApi(api);
      throw cause;
    }
  }, [api]);
  const resource = useLoadedResource(loader);
  const reloadResource = resource.reload;
  const reload = useCallback(async () => apiRef.current === api && (await reloadResource()) && !api.hasUncertainOperation(), [reloadResource, api]);
  const mutation = useVerifiedMutation(reload);
  const [tab, setTab] = useState<'products' | 'orders'>('products');
  const [editor, setEditor] = useState<ProductEditor | null>(null);
  const [settings, setSettings] = useState<SettingsEditor | null>(null);
  const [deleting, setDeleting] = useState<{ api: StoreManagementApi; scopeKey: string; product: StoreProduct } | null>(null);
  const [validation, setValidation] = useState('');
  const [picking, setPicking] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const editorRef = useRef(editor); editorRef.current = editor;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeKey = api.scopeKey();
  let active = deniedApi !== api; try { api.assertActive(); } catch { active = false; }
  const data = active && resource.value?.api === api && resource.value.data.scopeKey === scopeKey ? resource.value.data : null;
  const canShow = !!data && !resource.loading && !resource.error;
  const uncertain = mutation.uncertain || api.hasUncertainOperation() || !!data?.uncertainOperation;
  const needsRefresh = uncertain || outdated;
  const blocked = mutation.busy || picking || needsRefresh || !canShow;
  const currentTab = data?.configuration.storeEnabled ? tab : 'orders';
  const activeEditor = active && editor?.api === api && editor.scopeKey === scopeKey ? editor : null;
  const activeSettings = active && settings?.api === api && settings.scopeKey === scopeKey ? settings : null;
  const activeDeletion = active && deleting?.api === api && deleting.scopeKey === scopeKey ? deleting : null;
  const error = mutation.error || validation;

  function closeAll() { setEditor(null); setSettings(null); setDeleting(null); setValidation(''); setOutdated(false); mutation.reset(); }
  function closeDialog() { if (mutation.busy || picking) return; if (needsRefresh) void mutation.reconcile(closeAll); else closeAll(); }
  function refresh() {
    if (mutation.busy || picking) return;
    if (needsRefresh) void mutation.reconcile(closeAll); else { closeAll(); void resource.reload(); }
  }
  function openProduct(product?: StoreProduct) {
    if (blocked) return;
    closeAll(); setEditor({ api, scopeKey, expected: product, draft: product ? storeProductDraft(product) : emptyStoreProductDraft() });
  }
  function changeProduct(patch: Partial<StoreProductDraft>) {
    if (!blocked) setEditor(current => current?.scopeKey === scopeKey ? { ...current, draft: { ...current.draft, ...patch } } : current);
  }
  async function chooseImage() {
    if (!activeEditor || blocked) return;
    const target = activeEditor;
    setPicking(true); setValidation('');
    try {
      api.assertActive();
      const imageData = await pickImage();
      api.assertActive();
      if (mounted.current && imageData !== null && apiRef.current === api && api.scopeKey() === target.scopeKey && editorRef.current === target)
        setEditor({ ...target, draft: { ...target.draft, imageData } });
    } catch (cause) {
      if (mounted.current && apiRef.current === api && editorRef.current === target && api.scopeKey() === target.scopeKey) {
        if (accessDenied(cause)) setDeniedApi(api);
        setValidation(cause instanceof Error ? cause.message : 'تعذّر قراءة الصورة المختارة.');
      }
    } finally { if (mounted.current) setPicking(false); }
  }
  async function run(work: () => Promise<unknown>, close: () => void, message: string) {
    if (blocked) return;
    setValidation('');
    await mutation.run(async () => {
      try { return await work(); }
      catch (cause) {
        if (mounted.current && apiRef.current === api) {
          if (accessDenied(cause)) setDeniedApi(api);
          if (cause instanceof NativeApiError && cause.code === 'conflict') setOutdated(true);
        }
        throw cause;
      }
    }, close, () => message);
  }
  function saveProduct() {
    if (!activeEditor || blocked) return;
    try { normalizeStoreProductDraft(activeEditor.draft, activeEditor.expected); }
    catch (cause) { setValidation(cause instanceof Error ? cause.message : 'أكمل اسم المنتج وسعره بالنقاط.'); return; }
    void run(() => api.saveProduct({ draft: activeEditor.draft, expected: activeEditor.expected }), closeAll, 'حُفظ المنتج.');
  }
  function toggle(product: StoreProduct) {
    void run(() => api.toggleActive({ id: product.id, isActive: !product.isActive, expected: product }), closeAll,
      product.isActive ? 'أُخفي المنتج عن الطلاب.' : 'أُظهر المنتج للطلاب.');
  }
  function decide(order: StoreOrder, status: StoreOrderDecision) {
    void run(() => api.decideOrder({ id: order.id, status, expected: order }), closeAll,
      status === 'accepted' ? 'قُبل طلب الطالب.' : 'رُفض الطلب وأُعيدت النقاط وفق سجل الشراء.');
  }
  function updateConfiguration(patch: StoreConfigurationPatch) {
    if (!canShow || !data) return;
    void run(() => api.updateConfiguration({ patch, expected: data.configuration }), () => {}, 'حُفظ إعداد المتجر.');
  }

  return <ScreenLayout title="المتجر" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={refresh}>
    {!!mutation.notice && <AppText accessibilityLiveRegion="polite">{mutation.notice}</AppText>}
    {!!error && !activeEditor && !activeSettings && !activeDeletion && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    {uncertain && !mutation.error && <AppText accessibilityRole="alert">تعذّر تأكيد نتيجة التغيير. حدّث البيانات للتحقق قبل إجراء جديد.</AppText>}
    {canShow && data && <ManagementPanel>
      <ManagementTabs label="المتجر" value={currentTab} disabled={blocked} onChoose={setTab}
        items={[...(data.configuration.storeEnabled ? [{ key: 'products' as const, label: 'المنتجات' }] : []), { key: 'orders', label: 'طلبات الطلاب' }]} />
      <ManagementToolbar>
        <View style={{ flex: 1 }} />
        {needsRefresh && <ActionButton label="تحديث البيانات للتحقق" secondary disabled={mutation.busy || picking || resource.loading} onPress={refresh} />}
        <ActionButton label="إعدادات المتجر" secondary disabled={blocked} onPress={() => {
          closeAll(); setSettings({ api, scopeKey, configuration: data.configuration });
        }} />
        {currentTab === 'products' && <ActionButton icon="plus" label="إضافة منتج" disabled={blocked} onPress={() => openProduct()} />}
      </ManagementToolbar>
      {currentTab === 'products' ? <>
        {data.products.map(product => <ManagementRow key={product.id} title={product.name} disabled={blocked} onOpen={() => openProduct(product)}
          artwork={<View style={{ width: 48, opacity: product.isActive ? 1 : 0.6 }}><StoreProductImage imageData={product.imageData} name={product.name} size={48} /></View>}
          subtitle={`${formatPoints(product.pointsPrice)} · ${product.stock === null ? 'مخزون غير محدود' : `المتبقي ${product.stock}`}`}
          actions={<>
              <ManagementIconButton icon="edit" label={`تعديل ${product.name}`} disabled={blocked} onPress={() => openProduct(product)} />
              <ManagementIconButton icon={product.isActive ? 'eyeOff' : 'eye'} label={`${product.isActive ? 'إخفاء' : 'إظهار'} ${product.name}`}
                disabled={blocked} onPress={() => toggle(product)} />
              <ManagementIconButton icon="delete" label={`حذف ${product.name}`} disabled={blocked} onPress={() => {
                closeAll(); setDeleting({ api, scopeKey, product });
              }} />
            </>} />)}
        {!data.products.length && <ManagementEmpty>لا توجد منتجات.</ManagementEmpty>}
      </> : <>
        {!data.configuration.storeEnabled && <AppText>المتجر متوقف.</AppText>}
        {data.orders.filter(order => order.status === 'pending').map(order => <StoreOrderRow key={order.id} order={order} disabled={blocked} onDecide={status => decide(order, status)} />)}
        {!data.orders.some(order => order.status === 'pending') && <ManagementEmpty>لا توجد طلبات طلاب.</ManagementEmpty>}
      </>}
    </ManagementPanel>}
    <StoreProductDialog visible={!!activeEditor} editing={!!activeEditor?.expected} draft={activeEditor?.draft ?? emptyStoreProductDraft()}
      busy={mutation.busy} picking={picking} disabled={blocked} needsRefresh={needsRefresh} error={error}
      onChange={changeProduct} onPickImage={() => { void chooseImage(); }} onSave={saveProduct}
      onReconcile={() => { void mutation.reconcile(closeAll); }} onClose={closeDialog} />
    {activeSettings && <StoreSettingsDialog visible configuration={canShow && data ? data.configuration : activeSettings.configuration}
      busy={mutation.busy} disabled={blocked} needsRefresh={needsRefresh} error={error} onChange={updateConfiguration}
      onReconcile={() => { void mutation.reconcile(closeAll); }} onClose={closeDialog} />}
    <ConfirmDialog visible={!!activeDeletion} title="حذف المنتج؟" message={`حذف ${activeDeletion?.product.name ?? ''} من المنتجات المتاحة.`}
      confirmLabel={needsRefresh ? 'تحديث البيانات للتحقق' : 'حذف المنتج'} busy={mutation.busy} error={error}
      confirmDisabled={!needsRefresh && blocked} onClose={closeDialog} onConfirm={() => {
        if (needsRefresh) { void mutation.reconcile(closeAll); return; }
        if (activeDeletion) void run(() => api.removeProduct({ id: activeDeletion.product.id, expected: activeDeletion.product }), closeAll, 'حُذف المنتج.');
      }} />
  </ScreenLayout>;
}
