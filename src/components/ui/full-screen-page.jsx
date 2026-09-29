import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export default function FullScreenPage({ open, onClose, label, className, children }) {
  const page = useRef(null);
  useEffect(() => {
    if (!open || !page.current) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((element) => element !== page.current);
    const inertStates = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    page.current.focus();
    return () => {
      siblings.forEach((element, index) => { element.inert = inertStates[index]; });
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  useEffect(() => {
    const element = page.current;
    if (!open || !element) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && element.contains(event.target)) {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(<section ref={page} tabIndex={-1} aria-label={label} dir="rtl"
    className={cn('fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-background outline-none [font-family:var(--font-ui)]', className)}>{children}</section>, document.body);
}
