import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import StorePurchaseDialog from '@/components/store/StorePurchaseDialog';
import StoreProductCard from '@/components/store/StoreProductCard';
import PointsValue from '@/components/points/PointsValue';
import {
  loadOfflineStudentStore,
  purchaseOfflineStoreProduct,
} from '@/services/offlineStudentService';

const StudentStoreSection = ({ onBalanceChange, embedded = false }) => {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [buyingId, setBuyingId] = useState(null);
  const purchasing = useRef(false);
  const [confirmProduct, setConfirmProduct] = useState(null);
  const [pendingSync, setPendingSync] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const studentId = Number(localStorage.getItem('wajeh_student_id') || 0);
      const data = await loadOfflineStudentStore(studentId);
      setProducts(data.products || []);
      setPendingSync(Boolean(data.pendingSync));
      const nextBalance = Number(data.storeBalance || 0);
      setBalance(nextBalance);
      onBalanceChange?.(nextBalance);
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل المتجر');
    } finally {
      setIsLoading(false);
    }
  }, [onBalanceChange]);

  useEffect(() => {
    load();
  }, [load]);

  const purchase = async (product) => {
    if (purchasing.current) return;
    purchasing.current = true;
    setBuyingId(product.id);
    try {
      const studentId = Number(localStorage.getItem('wajeh_student_id') || 0);
      const result = await purchaseOfflineStoreProduct(studentId, product);
      const nextBalance = Number(result.storeBalance || 0);
      setBalance(nextBalance);
      setPendingSync(Boolean(result.pendingSync));
      onBalanceChange?.(nextBalance);
      if (product.stock !== null) {
        setProducts((current) => current
          .map((item) => item.id === product.id ? { ...item, stock: Math.max(0, Number(item.stock || 0) - 1) } : item)
          .filter((item) => item.stock === null || item.stock > 0));
      }
      setConfirmProduct(null);
      toast({
        title: result.pendingSync ? 'حُفظ الطلب محليًا' : 'أُرسل الطلب للمراجعة',
        description: result.pendingSync ? 'سيُرسل للمراجعة فور عودة الاتصال.' : undefined,
        duration: 3000,
      });
    } catch (error) {
      toast({ title: 'تعذر الشراء', description: error.message, variant: 'destructive' });
    } finally {
      purchasing.current = false;
      setBuyingId(null);
    }
  };

  if (isLoading) return <DashboardLoader className="min-h-[420px]" />;
  if (loadError) return <ErrorState message={loadError} onRetry={load} />;

  return (
    <div className="space-y-5 [font-family:var(--font-ui)]">
      <p className="flex items-center gap-2 text-sm font-bold" aria-live="polite">رصيد المتجر: <PointsValue value={Math.max(0, balance)} /></p>
      <StorePurchaseDialog product={confirmProduct} busy={buyingId !== null} onClose={() => setConfirmProduct(null)} onConfirm={purchase} />
      {pendingSync ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-center text-sm font-black text-primary">
            حُفظ الشراء وينتظر المزامنة.
          </CardContent>
        </Card>
      ) : null}
      {products.length === 0 ? (
        <div className={embedded ? "py-10 text-center text-sm text-muted-foreground" : "rounded-xl border p-10 text-center text-sm font-bold text-muted-foreground"}>لا توجد منتجات متاحة.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {products.map((product) => (
            <StoreProductCard key={product.id} product={product}>
                <Button
                  type="button"
                  variant="purchase"
                  className="h-11 w-full rounded-xl font-black"
                  disabled={buyingId !== null || balance < product.pointsPrice}
                  onClick={() => setConfirmProduct(product)}
                >
                  <ShoppingBag className="h-4 w-4" />
                  {buyingId === product.id ? 'جاري الشراء...' : balance < product.pointsPrice ? 'الرصيد غير كافٍ' : 'شراء'}
                </Button>
            </StoreProductCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentStoreSection;
