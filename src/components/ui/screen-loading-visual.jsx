import React, { useEffect, useState } from 'react';
import ErrorState from './error-state';
import LoadingSpinner from './loading-spinner';

export default function ScreenLoadingVisual() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 15_000);
    return () => window.clearTimeout(timer);
  }, []);
  if (timedOut) return <div className="w-full max-w-lg p-4" dir="rtl"><ErrorState message="تعذر إكمال التحميل. تحقق من الاتصال ثم أعد المحاولة." onRetry={() => window.location.reload()} /></div>;
  return <LoadingSpinner size="lg" />;
}
