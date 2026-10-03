import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Gift, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import SettingToggle from '@/components/ui/setting-toggle';
import { useToast } from '@/components/ui/use-toast';
import StoreSettingsActions from '@/components/store/StoreSettingsActions';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import PointsValue from '@/components/points/PointsValue';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementPanel, ManagementTabs, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { studentsApi } from '@/services/studentsApi';
import { formatHijriDateTime } from '../../../shared/hijri-calendar.js';

const emptyProduct = {
  name: '',
  imageData: '',
  pointsPrice: 1,
  stock: '',
  isActive: true,
};

const StoreSection = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [decidingOrderId, setDecidingOrderId] = useState(null);
  const decidingOrder = useRef(false);
  const [configuration, setConfiguration] = useState({
    storeEnabled: false,
    storePurchaseDeductsRanking: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [configurationSaving, setConfigurationSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const originalDisplayImage = useRef('');
  const [form, setForm] = useState(emptyProduct);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await studentsApi.getStoreConfiguration();
      setConfiguration(config);
      if (!config.storeEnabled) setTab('orders');
      const [productData, orderData] = await Promise.all([
        config.storeEnabled ? studentsApi.getStoreProducts() : Promise.resolve({ products: [] }),
        studentsApi.getStoreOrders(),
      ]);
      setProducts(productData.products || []);
      setOrders(orderData || []);
    } catch (error) {
      toast({ title: 'تعذر تحميل المتجر', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateConfiguration = async (patch) => {
    setConfigurationSaving(true);
    try {
      const config = await studentsApi.updateStoreConfiguration(patch);
      setConfiguration(config);
      if (!config.storeEnabled) {
        setProducts([]);
        setTab('orders');
      } else if (!configuration.storeEnabled) {
        const [productData, orderData] = await Promise.all([
          studentsApi.getStoreProducts(),
          studentsApi.getStoreOrders(),
        ]);
        setProducts(productData.products || []);
        setOrders(orderData || []);
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ إعداد المتجر', description: error.message, variant: 'destructive' });
    } finally {
      setConfigurationSaving(false);
    }
  };

  const openProduct = (product = null) => {
    originalDisplayImage.current = product?.imageData || '';
    setEditingId(product?.id || null);
    setForm(product ? {
      name: product.name || '',
      imageData: product.imageData || '',
      pointsPrice: Number(product.pointsPrice || 1),
      stock: product.stock ?? '',
      isActive: product.isActive !== false,
    } : emptyProduct);
    setDialogOpen(true);
  };

  const readImage = (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast({ title: 'صورة غير صالحة', description: 'اختر PNG أو JPG أو WebP بحجم لا يتجاوز 10 ميجابايت.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageData: (typeof reader.result === 'string' ? reader.result : '') }));
    reader.onerror = () => toast({ title: 'تعذر قراءة الصورة', variant: 'destructive' });
    reader.readAsDataURL(file);
  };

  const saveProduct = async () => {
    if (!form.name.trim() || !Number.isSafeInteger(Number(form.pointsPrice)) || Number(form.pointsPrice) < 1) {
      toast({ title: 'أكمل اسم المنتج وسعره بالنقاط.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        // Omit an unchanged display copy so the server retains the full original.
        imageData: editingId && form.imageData === originalDisplayImage.current ? undefined : form.imageData,
        pointsPrice: Number(form.pointsPrice),
        stock: form.stock === '' ? null : Number(form.stock),
      };
      const saved = editingId
        ? await studentsApi.updateStoreProduct(editingId, payload)
        : await studentsApi.createStoreProduct(payload);
      setProducts(current => editingId
        ? current.map(product => product.id === editingId ? { ...product, ...saved } : product)
        : [saved, ...current]);
      setDialogOpen(false);
    } catch (error) {
      toast({ title: 'تعذر حفظ المنتج', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProductVisibility = async (product) => {
    const isActive = !product.isActive;
    try {
      await studentsApi.setStoreProductActive(product.id, isActive);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, isActive } : item));
    } catch (error) {
      toast({ title: `تعذر ${isActive ? 'إظهار' : 'إخفاء'} المنتج`, description: error.message, variant: 'destructive' });
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    try {
      await studentsApi.removeStoreProduct(deletingProduct.id);
      setProducts((current) => current.filter((item) => item.id !== deletingProduct.id));
      setDeletingProduct(null);
    } catch (error) {
      toast({ title: 'تعذر حذف المنتج', description: error.message, variant: 'destructive' });
    }
  };

  const decideOrder = async (order, status) => {
    if (decidingOrder.current) return;
    decidingOrder.current = true;
    setDecidingOrderId(order.id);
    try {
      await studentsApi.decideStoreOrder(order.id, status);
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item));
    } catch (error) {
      toast({ title: 'تعذر تحديث الطلب', description: error.message, variant: 'destructive' });
    } finally {
      decidingOrder.current = false;
      setDecidingOrderId(null);
    }
  };

  const pendingOrders = orders.filter((order) => (order.status || (order.fulfilled ? 'accepted' : 'pending')) === 'pending');

  if (isLoading) return <DashboardLoader className="min-h-[420px]" />;

  const configurationActions = (
    <DashboardMobileHeaderActions>
      <StoreSettingsActions configuration={configuration} saving={configurationSaving} onChange={updateConfiguration} deductionLabel="خصم النقاط من الترتيب عند الشراء من المتجر" />
    </DashboardMobileHeaderActions>
  );

  const rowActionClass = 'h-11 w-11 border-transparent bg-transparent';
  const _resolveStoreSection = () => {
    if (tab === 'products') {
      if (products.length === 0) {
        return <ManagementEmpty>لا توجد منتجات.</ManagementEmpty>;
      }
      return <ManagementList label="المنتجات">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
                <div className={`flex min-w-0 flex-1 items-center gap-3 ${product.isActive ? '' : 'opacity-60 grayscale-[0.25]'}`}>
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-primary">
                    {product.imageData
                      ? <img src={product.imageData} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
                      : <Gift className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-foreground">{product.name}</div>
                    <div className="mt-0.5 flex min-w-0 flex-col items-start gap-x-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
                      <PointsValue value={product.pointsPrice} className="text-sm" iconClassName="h-4 w-4" />
                      <span className="hidden sm:inline" aria-hidden="true">·</span>
                      <span className="max-w-full truncate">{product.stock !== null && product.stock !== undefined ? `المتبقي ${Number(product.stock || 0).toLocaleString('ar-SA-u-nu-latn')}` : 'مخزون غير محدود'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ManagementIconButton className={rowActionClass} tone="primary" onClick={() => openProduct(product)} title="تعديل" aria-label={`تعديل ${product.name}`}><Pencil className="h-4 w-4" /></ManagementIconButton>
                  <ManagementIconButton className={rowActionClass} onClick={() => toggleProductVisibility(product)} title={product.isActive ? 'إخفاء' : 'إظهار'} aria-label={`${product.isActive ? 'إخفاء' : 'إظهار'} ${product.name}`}>{product.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</ManagementIconButton>
                  <ManagementIconButton className={rowActionClass} tone="destructive" onClick={() => setDeletingProduct(product)} title="حذف" aria-label={`حذف ${product.name}`}><Trash2 className="h-4 w-4" /></ManagementIconButton>
                </div>
              </li>
            ))}
          </ManagementList>;
    }
    if (pendingOrders.length === 0) {
      return <ManagementEmpty>لا توجد طلبات طلاب.</ManagementEmpty>;
    }
    return <ManagementList label="طلبات الطلاب">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-nowrap sm:px-6">
                <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <div className="truncate text-base font-bold text-foreground">{order.studentName} — {order.productName}</div>
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">{order.committeeName || 'بدون حلقة'} · {formatHijriDateTime(order.createdAt)}</div>
                </div>
                <PointsValue value={order.pointsPrice} className="shrink-0 text-sm" />
                <div className="ms-auto flex shrink-0 gap-2 sm:ms-0">
                  <Button className="min-h-11" disabled={decidingOrderId !== null} onClick={() => decideOrder(order, 'accepted')}>قبول</Button>
                  <Button variant="outline" className="min-h-11 text-destructive" disabled={decidingOrderId !== null} onClick={() => decideOrder(order, 'rejected')}>رفض</Button>
                </div>
              </li>
            ))}
          </ManagementList>;
  };
  return (
    <>
      {configurationActions}
      <ManagementPanel>
        <ManagementTabs
          label="أقسام المتجر"
          items={[...(configuration.storeEnabled ? [{ value: 'products', label: 'المنتجات' }] : []), { value: 'orders', label: 'طلبات الطلاب' }]}
          value={tab}
          onChange={setTab}
        >
          {tab === 'products' && (
            <ManagementToolbar className="justify-end">
              <Button type="button" onClick={() => openProduct()} className="h-11 gap-2 px-5">
                <Plus className="h-4 w-4" /> إضافة منتج
              </Button>
            </ManagementToolbar>
          )}
          {_resolveStoreSection()}
        </ManagementTabs>
      </ManagementPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader><DialogTitle>{editingId ? 'تعديل المنتج' : 'إضافة منتج'}</DialogTitle></DialogHeader>
          <FormGrid className="py-2">
            <FormField label="اسم المنتج" htmlFor="store-product-name" wide>
              <Input id="store-product-name" className="h-11" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm font-black text-primary transition-colors hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring">
                {form.imageData ? <img src={form.imageData} alt="معاينة المنتج" className="aspect-square h-20 w-20 rounded-xl bg-background object-contain p-1" /> : <ImagePlus className="h-6 w-6" />}
                <span>{form.imageData ? 'تغيير الصورة' : 'إضافة صورة (اختياري)'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => readImage(event.target.files?.[0])} />
              </label>
            </div>
            <FormField label="السعر بالنقاط" htmlFor="store-product-price">
              <Input id="store-product-price" className="h-11" type="number" min="1" value={form.pointsPrice} onChange={(event) => setForm({ ...form, pointsPrice: Number(event.target.value || 1) })} />
            </FormField>
            <FormField label="المخزون" htmlFor="store-product-stock">
              <Input id="store-product-stock" className="h-11" type="number" min="0" placeholder="غير محدود" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <SettingToggle label="إظهار المنتج للطلاب" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} />
            </div>
          </FormGrid>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button type="button" className="h-11" disabled={isSaving} onClick={saveProduct}>{isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingProduct)} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <DialogContent className="max-w-sm bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader><DialogTitle>حذف المنتج؟</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingProduct(null)}>إلغاء</Button>
            <Button type="button" variant="destructive" onClick={deleteProduct}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoreSection;
