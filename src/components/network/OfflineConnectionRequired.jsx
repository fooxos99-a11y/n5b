import React from 'react';
import { WifiOff } from 'lucide-react';

const OfflineConnectionRequired = ({ className = '', message = 'المصحف فقط متاح دون اتصال في حساب الطالب.' }) => (
  <div className={`grid min-h-[420px] place-items-center px-4 py-10 [font-family:var(--font-ui)] ${className}`} dir="rtl">
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-[0_12px_35px_hsl(210_40%_20%/0.08)] sm:p-8">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <WifiOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-black text-foreground">يلزم الاتصال بالإنترنت</h2>
      <p className="mt-2 text-sm font-bold leading-7 text-muted-foreground">
        {message}
      </p>
    </div>
  </div>
);

export default OfflineConnectionRequired;
