import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ErrorState = ({ message, onRetry, retryLabel = 'إعادة المحاولة', retryAt = 0, className = '' }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
  <div
    role="alert"
    className={`grid min-h-40 place-items-center rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-center [font-family:var(--font-ui)] ${className}`}
  >
    <div className="max-w-md">
      <AlertTriangle className="mx-auto h-7 w-7 text-destructive" aria-hidden="true" />
      <p className="mt-3 font-black text-destructive">{message || 'تعذر تحميل البيانات.'}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4 min-h-11 gap-2" onClick={onRetry} disabled={seconds > 0}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {seconds ? `${retryLabel} بعد ${seconds} ثانية` : retryLabel}
        </Button>
      ) : null}
    </div>
  </div>
);
};

export default ErrorState;
