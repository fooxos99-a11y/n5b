import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import RequiredUpdateDialog from '@/components/native/RequiredUpdateDialog';
import { getRequiredNativeUpdate } from '@/services/nativeUpdateService';

export default function NativeUpdateDialog() {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false, pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const policy = await getRequiredNativeUpdate(await App.getInfo(), Capacitor.getPlatform());
        if (!disposed && policy) setUpdate(policy);
      } catch {
        // A network failure must not lock out offline users; retry on resume/online.
      } finally { pending = false; }
    };
    void check();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
    window.addEventListener('online', check);
    const interval = window.setInterval(check, 60000);
    return () => { disposed = true; window.clearInterval(interval); window.removeEventListener('online', check); void listener.then(handle => handle.remove()); };
  }, []);
  return <RequiredUpdateDialog open={Boolean(update)} url={update?.url} />;
}
