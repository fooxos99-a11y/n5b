import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatPoints } from '../../../src/lib/pointsFormat.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { StoreProductCard } from '../components/store/StoreProductCard';
import { StorePurchaseDialog } from '../components/store/StorePurchaseDialog';
import { sameStoreProduct, storePurchaseAvailability } from '../components/store/storePresentation';
import type { StoreProduct } from '../domain/storeManagement';
import type { StudentStoreCoordinator, StudentStoreView } from '../services/storePurchaseCoordinator';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { usePalette } from '../theme';

export function StudentStoreScreen({ coordinator, onBack }: { coordinator: StudentStoreCoordinator; onBack: () => void }) {
  const palette = usePalette();
  const refreshRequested = useRef(false);
  const [purchasedView, setPurchasedView] = useState<{ coordinator: StudentStoreCoordinator; data: StudentStoreView } | null>(null);
  const coordinatorRef = useRef(coordinator); coordinatorRef.current = coordinator;
  const loader = useCallback(async (signal: AbortSignal) => {
    const refresh = refreshRequested.current; refreshRequested.current = false;
    const next = await (refresh ? coordinator.reconcile(signal) : coordinator.load(signal));
    if (!signal.aborted && coordinatorRef.current === coordinator) setPurchasedView(null);
    return { coordinator, data: next };
  }, [coordinator]);
  const resource = useLoadedResource(loader);
  const [confirmation, setConfirmation] = useState<{ coordinator: StudentStoreCoordinator; scopeKey: string; product: StoreProduct } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeKey = coordinator.scopeKey();
  const candidate = purchasedView?.coordinator === coordinator ? purchasedView.data
    : resource.value?.coordinator === coordinator ? resource.value.data : null;
  const data = candidate?.scopeKey === scopeKey && !resource.loading && !resource.error ? candidate : null;
  const selected = confirmation?.coordinator === coordinator && confirmation.scopeKey === scopeKey && data ? confirmation.product : null;
  const currentProduct = data?.products.find(product => product.id === selected?.id);
  const changedProduct = !!selected && !sameStoreProduct(currentProduct, selected);
  const blocked = busy || resource.loading || !!resource.error || !data || data.pendingSync;
  const confirmationError = error || (changedProduct ? 'تغيّرت بيانات المنتج. حدّثها قبل الشراء.' : '');

  function refresh() {
    if (locked.current || resource.loading) return;
    setConfirmation(null); setError(''); setNotice(''); refreshRequested.current = true; void resource.reload();
  }
  function close() { if (!locked.current) { setConfirmation(null); setError(''); } }
  async function purchase() {
    if (locked.current || blocked || !selected || !data || !data.enabled || changedProduct
      || storePurchaseAvailability(selected, data.storeBalance) !== 'available') return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    const activeCoordinator = coordinator;
    try {
      const result = await activeCoordinator.purchase(selected);
      if (mounted.current && coordinatorRef.current === activeCoordinator && activeCoordinator.scopeKey() === result.snapshot.scopeKey) {
        setPurchasedView({ coordinator: activeCoordinator, data: result.snapshot }); setConfirmation(null);
        setNotice(result.state === 'queued' ? 'حُفظ الطلب محليًا. ينتظر المزامنة.' : 'أُرسل الطلب للمراجعة.');
      }
    } catch (cause) {
      if (mounted.current && coordinatorRef.current === activeCoordinator) {
        setError(cause instanceof Error ? cause.message : 'تعذّر الشراء.');
        await resource.reload();
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const availabilityLabel = (product: StoreProduct) => {
    const availability = storePurchaseAvailability(product, data?.storeBalance ?? null);
    return availability === 'available' ? 'شراء' : availability === 'insufficient' ? 'الرصيد غير كافٍ'
      : availability === 'unknown-balance' ? 'الرصيد غير متاح' : 'غير متاح';
  };
  return <ScreenLayout title="المتجر" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={refresh}
    actions={<View style={screenStyles.actions}><ActionButton label={data?.pendingSync ? 'مزامنة الطلبات' : 'تحديث'} secondary
      disabled={busy || resource.loading} onPress={refresh} /></View>}>
    {!!notice && data && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    {!!error && !selected && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText>}
    {data && <>
      <AppText style={screenStyles.bold}>رصيد المتجر: {data.storeBalance === null ? 'غير متاح' : formatPoints(data.storeBalance)}</AppText>
      {!!data.notice && <AppText accessibilityLiveRegion="polite">{data.notice}</AppText>}
      {data.pendingSync && <SectionCard title="المزامنة"><AppText>حُفظ الشراء وينتظر المزامنة.</AppText>
        <AppText>الطلبات المحفوظة محليًا: {data.pendingCount}</AppText></SectionCard>}
      {data.source === 'cache' && <AppText style={{ color: palette.muted }}>بيانات المتجر المحفوظة محليًا.</AppText>}
      {!data.enabled ? <SectionCard><AppText>المتجر متوقف.</AppText></SectionCard>
        : !data.products.length ? <SectionCard><AppText>لا توجد منتجات متاحة.</AppText></SectionCard>
          : <View style={screenStyles.grid}>{data.products.map(product => <View key={product.id} style={styles.product}>
            <StoreProductCard product={product}>
              <ActionButton label={availabilityLabel(product)} accessibilityLabel={`${availabilityLabel(product)} ${product.name}`}
                disabled={blocked || storePurchaseAvailability(product, data.storeBalance) !== 'available'} onPress={() => {
                  setError(''); setNotice(''); setConfirmation({ coordinator, scopeKey, product });
                }} />
            </StoreProductCard>
          </View>)}</View>}
    </>}
    <StorePurchaseDialog product={selected} busy={busy}
      disabled={blocked || changedProduct || !data?.enabled || !selected || storePurchaseAvailability(selected, data.storeBalance) !== 'available'}
      error={confirmationError} onConfirm={() => { void purchase(); }} onClose={close} />
  </ScreenLayout>;
}
const styles = StyleSheet.create({ product: { flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0, maxWidth: '100%' } });
