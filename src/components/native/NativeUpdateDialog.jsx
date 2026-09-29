import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
        if (!disposed) setUpdate(policy);
      } catch {
        // A network failure must not lock out offline users; retry on resume/online.
      } finally { pending = false; }
    };
    void check();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
    window.addEventListener('online', check);
    return () => { disposed = true; window.removeEventListener('online', check); void listener.then(handle => handle.remove()); };
  }, []);
  return <Dialog open={Boolean(update)}><DialogContent dir="rtl" aria-describedby={undefined} className="[font-family:var(--font-ui)]" onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
    <DialogTitle>يلزم تحديث التطبيق للمتابعة</DialogTitle>
    <Button asChild className="min-h-11"><a href={update?.url} target="_blank" rel="noreferrer">تحديث الآن</a></Button>
  </DialogContent></Dialog>;
}
