import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePalette } from '../theme';
import { useDialogDismiss } from './dialogDismiss';
import type { AnchoredPopoverProps } from './AnchoredPopover';

export function AnchoredPopover({ visible, onClose, label, trigger, children, width: desiredWidth,
  align = 'end', busy = false, autoFocus = true, edgeGap = 8, padding = 6, borderRadius = 16 }: AnchoredPopoverProps) {
  const palette = usePalette(); const anchor = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null); const wasVisible = useRef(false);
  const restoreOnClose = useRef(true);
  const [retained, retain] = useState(visible); const rendered = visible || retained;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, width: desiredWidth, maxHeight: 400 });
  const restoreFocus = () => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); };
  const close = () => { if (!busy) { restoreOnClose.current = true; restoreFocus(); onClose(); } };
  useDialogDismiss({ visible, rendered, busy, onClose: close });
  useLayoutEffect(() => {
    // A nested popover must remain inside RN Web's parent focus trap.
    setHost(anchor.current?.closest<HTMLElement>('[aria-modal="true"]') ?? document.body);
  }, [visible]);
  useLayoutEffect(() => {
    if (visible) { retain(true); return; }
    const timer = window.setTimeout(() => retain(false), 200);
    return () => window.clearTimeout(timer);
  }, [visible]);
  useLayoutEffect(() => {
    if (visible && !wasVisible.current) {
      if (!content.current) return;
      opener.current = anchor.current?.querySelector<HTMLElement>('button,input,[tabindex="0"]') ?? null;
      if (autoFocus) content.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')?.focus();
    } else if (!visible && wasVisible.current) {
      if (restoreOnClose.current) restoreFocus();
      restoreOnClose.current = true;
    }
    wasVisible.current = visible;
  }, [visible, autoFocus, host]);
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      if (!anchor.current) return;
      const bounds = anchor.current.getBoundingClientRect();
      const width = Math.min(desiredWidth, window.innerWidth - edgeGap * 2), maxHeight = Math.max(44, window.innerHeight - edgeGap * 2);
      const height = Math.min(content.current?.scrollHeight ?? 0, maxHeight);
      const naturalLeft = align === 'center' ? bounds.left + (bounds.width - width) / 2 : align === 'end' ? bounds.left : bounds.right - width;
      const below = bounds.bottom + 6;
      setPosition({ width, maxHeight, left: Math.max(edgeGap, Math.min(window.innerWidth - width - edgeGap, naturalLeft)),
        top: below + height <= window.innerHeight - edgeGap ? below : Math.max(edgeGap, bounds.top - height - 6) });
    };
    place(); const observer = new ResizeObserver(place); if (content.current) observer.observe(content.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [visible, desiredWidth, align, edgeGap, host]);
  useLayoutEffect(() => {
    if (!visible) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !content.current?.contains(event.target) && !busy) {
        restoreOnClose.current = false; onClose();
      }
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true); };
  }, [visible, busy, onClose]);
  return <div ref={anchor} style={{ minWidth: 0, position: 'relative', display: 'flex' }}>
    {trigger}
    {rendered && host && createPortal(<>
      <style>{`@keyframes nukhab-popover-in{from{opacity:0;transform:translateY(-8px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes nukhab-popover-out{to{opacity:0;transform:translateY(-8px) scale(.95)}}@media(prefers-reduced-motion:reduce){.nukhab-anchored-popover{animation-duration:0s!important}}`}</style>
      <div ref={content} role="dialog" aria-label={label} aria-hidden={!visible} inert={!visible} dir="rtl" className="nukhab-anchored-popover"
        style={{ position: 'fixed', zIndex: 10000, ...position, padding, boxSizing: 'border-box', overflowY: 'auto',
          background: palette.card, color: palette.text, border: `1px solid ${palette.border}`, borderRadius,
          boxShadow: '0 14px 35px rgba(23,38,54,0.16)', fontFamily: 'Cairo',
          pointerEvents: visible ? 'auto' : 'none', animation: `nukhab-popover-${visible ? 'in' : 'out'} 200ms ease both` }}>{children}</div>
    </>, host)}
  </div>;
}
