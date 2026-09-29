import React from 'react';
import { createRoot } from 'react-dom/client';
import StoreSection from '../../src/components/dashboard/StoreSection';
import { Toaster } from '../../src/components/ui/toaster';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(<main className="p-3" dir="rtl">
  <header id="dashboard-mobile-header-actions" className="mb-4 flex justify-start" />
  <StoreSection /><Toaster />
</main>);
