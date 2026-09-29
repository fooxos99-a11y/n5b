import React, { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Toast, ToastAction, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';
import { deferredActions, enableDashboardUndo } from '@/lib/deferredActions';
import { useToast } from '@/components/ui/use-toast';

export default function DashboardUndoNotice({ active }) {
  const { toast } = useToast();
  const undo = React.useCallback(async id => {
    try { if (await deferredActions.cancel(id)) toast({ title: 'تم التراجع عن الأمر' }); }
    catch (error) { toast({ title: error.message || 'تعذر التراجع عن الأمر', variant: 'destructive' }); }
  }, [toast]);
  const actions = useSyncExternalStore(deferredActions.subscribe, deferredActions.getSnapshot);
  useEffect(() => {
    enableDashboardUndo(active);
    const cancel = () => deferredActions.cancelAll();
    const undoKey = event => {
      if (!active || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return;
      if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const latest = deferredActions.getSnapshot().at(-1);
      if (!latest) return;
      event.preventDefault();
      void undo(latest.id);
    };
    window.addEventListener('pagehide', cancel);
    window.addEventListener('keydown', undoKey);
    return () => {
      enableDashboardUndo(false);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('keydown', undoKey);
    };
  }, [active, undo]);
  if (!active) return null;
  return <ToastProvider swipeDirection="right">
    {actions.map(action => <Toast key={action.id} open duration={Infinity} data-dashboard-undo="" style={{ pointerEvents: 'auto' }}
      onOpenChange={open => { if (!open && !action.busy) deferredActions.dismiss(action.id); }}
      dir="rtl" className="items-center gap-2 px-3 py-2 [font-family:var(--font-ui)]">
      <div className="min-w-0 flex-1">
        <ToastTitle className="text-xs">{action.label}</ToastTitle>
      </div>
      <ToastAction className="h-11 min-w-16 shrink-0" disabled={action.busy} altText="التراجع عن الأمر المنفذ"
        title="تراجع (Ctrl+Z)" aria-keyshortcuts="Control+Z Meta+Z"
        onClick={event => { event.preventDefault(); void undo(action.id); }}>تراجع</ToastAction>
    </Toast>)}
    {createPortal(<ToastViewport aria-live="polite" aria-label="الأوامر القابلة للتراجع" className="pointer-events-none top-auto bottom-[max(1rem,env(safe-area-inset-bottom))] z-[400] max-h-[40dvh] overflow-y-auto sm:top-auto" />, document.body)}
  </ToastProvider>;
}
