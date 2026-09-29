import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OwnerErrorState = ({ message, onRetry, className = '' }) => (
  <div
    role="alert"
    className={`grid min-h-48 place-items-center rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center [font-family:var(--font-ui)] ${className}`}
  >
    <div className="max-w-md">
      <AlertTriangle className="mx-auto h-7 w-7 text-red-600" aria-hidden="true" />
      <p className="mt-3 font-black text-red-700 dark:text-red-300">{message || 'تعذر تحميل البيانات.'}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4 h-11 gap-2" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  </div>
);

export default OwnerErrorState;
