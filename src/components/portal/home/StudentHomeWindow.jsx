import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import useMediaQuery from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function StudentHomeWindow({ title, onClose, children, wide = false, compact = false, surfaceKey = title }) {
  const mobile = useMediaQuery('(max-width: 899px)');
  const storePage = surfaceKey === 'store';
  const fullPage = surfaceKey === 'mushaf' || (storePage && !mobile);
  const heading = useRef(null);
  const body = useRef(null);
  const positions = useRef(new Map());
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = positions.current.get(surfaceKey) || 0; }, [surfaceKey]);
  const content = <div ref={body} onScroll={(event) => positions.current.set(surfaceKey, event.currentTarget.scrollTop)} className={`student-home-window-body ${storePage ? '!p-4 sm:!p-6' : ''}`}>{children}</div>;
  useEffect(() => {
    if (!mobile && !fullPage) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    heading.current?.focus();
    return () => { document.body.style.overflow = overflow; };
  }, [mobile, fullPage]);
  if (mobile || fullPage) return <section ref={fullPage ? heading : undefined} tabIndex={fullPage ? -1 : undefined} className={`student-home-window ${fullPage ? 'student-full-page' : 'student-mobile-screen'}`} dir="rtl" aria-label={title}>
    {(!mobile && fullPage) && <header className="student-home-window-header"><Button variant="ghost" size="icon" onClick={onClose} aria-label="رجوع"><ArrowRight size={21} /></Button><h1>{title}</h1></header>}
    {(mobile || !fullPage) && <header className="student-home-window-header"><Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق النافذة" title="رجوع"><ArrowRight size={21} /></Button><h1 ref={heading} tabIndex={-1}>{title}</h1></header>}
    {content}
  </section>;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className={`student-home-window ${wide ? 'student-home-window-wide' : ''} ${compact ? 'student-home-window-compact' : ''}`} dir="rtl" aria-describedby={undefined}>
      {<DialogHeader className="student-home-window-header"><DialogTitle>{title}</DialogTitle><Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق النافذة"><X size={21} /></Button></DialogHeader>}
      {content}
    </DialogContent>
  </Dialog>;
}
