import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StorePurchaseDialog from '../../src/components/store/StorePurchaseDialog';
import StoreSection from '../../src/components/dashboard/StoreSection';
import { Button } from '../../src/components/ui/button';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
studentsApi.getStoreConfiguration = async () => ({ storeEnabled: true });
studentsApi.getStoreProducts = async () => ({ products: [] });
studentsApi.getStoreOrders = async () => [1, 2].map(id => ({ id, studentName: `طالب اختبار ${id}`, productName: 'منتج اختبار', pointsPrice: 30, status: 'pending' }));
function Preview() {
  const [product, setProduct] = useState(null);
  const [result, setResult] = useState('');
  studentsApi.decideStoreOrder = async (id, status) => { setResult(`${id}:${status}`); return { ok: true, status }; };
  return <main dir="rtl" className="p-3 [font-family:var(--font-ui)]">
    <Button onClick={() => setProduct({ name: 'منتج اختبار', pointsPrice: 30 })}>شراء</Button>
    <StorePurchaseDialog product={product} onClose={() => setProduct(null)} onConfirm={() => { setResult('confirmed'); setProduct(null); }} />
    <output aria-label="نتيجة الاختبار">{result}</output>
    <StoreSection />
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
