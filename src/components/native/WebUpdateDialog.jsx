import React, { useEffect, useState } from 'react';
import RequiredUpdateDialog from '@/components/native/RequiredUpdateDialog';
import { hasRequiredWebUpdate } from '@/services/webUpdateService';

export default function WebUpdateDialog() {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let disposed = false, pending = false;
    const check = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const changed = await hasRequiredWebUpdate({ currentBuild: import.meta.env.VITE_APP_BUILD_ID, baseUrl: import.meta.env.BASE_URL });
        if (!disposed && changed) setRequired(true);
      } catch {
        // Keep offline work available when the current deployment cannot be checked.
      } finally { pending = false; }
    };
    void check();
    const interval = window.setInterval(check, 60000);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return <RequiredUpdateDialog open={required} onUpdate={() => window.location.reload()} />;
}
