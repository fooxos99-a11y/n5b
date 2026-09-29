import React from 'react';
import { createRoot } from 'react-dom/client';
import NarrationDaySection from '@/components/dashboard/NarrationDaySection';
import '@/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
createRoot(document.getElementById('root')).render(<main className="p-3"><div id="dashboard-mobile-header-actions" className="mb-3" /><NarrationDaySection /></main>);
