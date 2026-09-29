import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AccountLoginPage from '../../src/components/public/AccountLoginPage';
import StoreProductCard from '../../src/components/store/StoreProductCard';
import StudentHomeHeader from '../../src/components/portal/home/StudentHomeHeader';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
import '../../src/styles/loading-spinner.css';
import '../../src/components/portal/home/student-home.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const shape = (width, height) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0799a1"/></svg>`);
function Fixture() {
  const [loading, setLoading] = useState(false);
  if (new URLSearchParams(location.search).has('login')) return <AccountLoginPage site={{ name: 'اختبار' }} loading={loading} onLogin={() => setLoading(true)} />;
  return <main className="student-home" dir="rtl">
    <StudentHomeHeader points={8000} progress={30} onOpen={() => {}} onLogout={() => {}} />
    <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
      {[[40, 200], [200, 40], [100, 100], [80, 180]].map(([width, height], index) => <StoreProductCard key={index}
        product={{ imageData: shape(width, height), name: index % 2 ? 'اسم منتج أطول يمتد إلى سطرين بوضوح' : 'منتج', pointsPrice: 75, stock: 5 }}>
        <Button variant="purchase" className="w-full">شراء</Button>
      </StoreProductCard>)}
    </div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
