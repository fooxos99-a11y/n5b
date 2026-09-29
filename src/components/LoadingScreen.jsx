import React, { useEffect, useState } from 'react';
import ErrorState from '@/components/ui/error-state';
import LoadingIndicator from '@/components/ui/loading-indicator';

const LoadingScreen = ({ timeoutMs = 15_000 }) => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [timeoutMs]);

  if (!timedOut) return <LoadingIndicator mode="screen" delayMs={0} />;
  return (
    <main className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-background p-4 text-foreground [font-family:var(--font-ui)]" dir="rtl">
      <ErrorState
        className="w-full max-w-lg bg-card"
        message="تعذر إكمال التحميل. تحقق من الاتصال ثم أعد المحاولة."
        onRetry={() => window.location.reload()}
      />
    </main>
  );
};

export default LoadingScreen;
