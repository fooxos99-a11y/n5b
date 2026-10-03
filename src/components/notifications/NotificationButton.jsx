import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studentsApi } from '@/services/studentsApi';
import { formatHijriDateTime } from '../../../shared/hijri-calendar.js';
import { enableDeviceNotifications, isNativeNotificationsAvailable, listenForDeviceNotifications } from '@/services/nativeNotifications';

const NotificationButton = ({ showTrigger = true, presentation = 'dialog', open: controlledOpen, onOpenChange, onUnreadCountChange }) => {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback((value) => { setLocalOpen(value); onOpenChange?.(value); }, [onOpenChange]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await studentsApi.getNotifications();
    setNotifications(Array.isArray(rows) ? rows : []);
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    const refresh = () => void load().catch(() => { setError('تعذر تحميل الإشعارات.'); setLoading(false); });
    refresh();
    const interval = window.setInterval(refresh, 45_000);
    let disposed = false;
    let cleanup;
    void listenForDeviceNotifications({ onNotification: refresh, onOpen: () => { setOpen(true); refresh(); }, onError: setError })
      .then((remove) => { if (disposed) remove(); else cleanup = remove; })
      .catch(() => setError('تعذر تهيئة إشعارات الجهاز.'));
    window.addEventListener('focus', refresh);
    return () => { disposed = true; cleanup?.(); window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [load, setOpen]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);
  useEffect(() => { onUnreadCountChange?.(unreadCount); }, [unreadCount, onUnreadCountChange]);
  const attemptedReads = useRef(new Set());
  const markRead = useCallback(async (ids) => {
    setNotifications(current => current.map(item => ids.includes(item.id) ? { ...item, isRead: true } : item));
    await studentsApi.markNotificationsRead(ids).catch(() => {
      setNotifications(current => current.map(item => ids.includes(item.id) ? { ...item, isRead: false } : item));
      setError('تعذر تحديث حالة القراءة.');
    });
  }, []);
  useEffect(() => {
    if (!open) { attemptedReads.current.clear(); return; }
    const ids = notifications.filter(item => !item.isRead && !attemptedReads.current.has(item.id)).map(item => item.id);
    if (!ids.length) return;
    ids.forEach(id => attemptedReads.current.add(id));
    void markRead(ids);
  }, [open, notifications, markRead]);

  const trigger = (<Button type="button" variant="outline" size="icon" onClick={presentation === 'popover' ? undefined : () => setOpen(true)} className="relative h-11 w-11 touch-manipulation [font-family:var(--font-ui)]" aria-label={`الإشعارات${unreadCount && !open ? '، ' + unreadCount + ' غير مقروء' : ''}`}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && !open && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-white">{Math.min(99, unreadCount)}</span>}
      </Button>);
  const _resolveContent = () => {
    if (loading) {
      return <LoadingIndicator className="py-3" />;
    }
    if (notifications.length) {
      return notifications.map((notification) => (
              <article key={notification.id} className={`w-full rounded-xl border p-3 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${notification.isRead ? 'border-primary/10 bg-background/60' : 'border-primary/35 bg-primary/10'}`}>
                <div className="break-words font-black text-foreground">{notification.title}</div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6 text-muted-foreground">{notification.body}</p>
                <div className="mt-2 text-xs font-bold text-muted-foreground">{formatHijriDateTime(notification.createdAt)}</div>
              </article>
            ));
    }
    return <div className="py-3 text-right text-xs font-bold text-muted-foreground">لا توجد إشعارات.</div>;
  };
  const content = <>          {isNativeNotificationsAvailable() && <Button variant="outline" className="min-h-11" onClick={() => void enableDeviceNotifications().catch((e) => setError(e.message))}>تفعيل إشعارات الجهاز</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
            {_resolveContent()}
          </div>
</>;
  if (presentation === 'popover') return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} dir="rtl" aria-label="الإشعارات" className="student-home-notifications flex max-h-[min(70dvh,520px)] w-[min(360px,calc(100vw-32px))] flex-col gap-3 rounded-2xl bg-card p-2 text-foreground [font-family:var(--font-ui)]">
      {content}
    </PopoverContent>
  </Popover>;
  return <>{showTrigger && trigger}<Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col bg-card p-4 [font-family:var(--font-ui)] sm:p-5" dir="rtl">
      <DialogHeader><DialogTitle>الإشعارات</DialogTitle></DialogHeader>{content}
    </DialogContent>
  </Dialog></>;
};

export default NotificationButton;
