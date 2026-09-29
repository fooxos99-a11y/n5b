import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ScreenLoadingProvider from '../../src/components/ui/screen-loading-provider';
import PageLoadingBoundary from '../../src/components/ui/page-loading-boundary';
import LoadingIndicator from '../../src/components/ui/loading-indicator';
import '../../src/index.css';
import '../../src/styles/loading-spinner.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
function Fixture() {
  const [pending, setPending] = useState(true);
  useEffect(() => {
    const complete = () => setPending(false);
    window.addEventListener('test-loading-complete', complete);
    return () => window.removeEventListener('test-loading-complete', complete);
  }, []);
  return <ScreenLoadingProvider><PageLoadingBoundary>{pending ? <LoadingIndicator /> : <output>جاهز</output>}</PageLoadingBoundary></ScreenLoadingProvider>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
