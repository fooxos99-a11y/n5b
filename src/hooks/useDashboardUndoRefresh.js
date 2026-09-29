import { useEffect, useState } from 'react';

export default function useDashboardUndoRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let dirty = false;
    let frame;
    const refresh = () => {
      if (!dirty) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!dirty || document.querySelector('[role="dialog"]')
          || document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
        dirty = false;
        setRevision(value => value + 1);
      });
    };
    const changed = () => { dirty = true; refresh(); };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('dashboard-undo-completed', changed);
    document.addEventListener('focusout', refresh);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('dashboard-undo-completed', changed);
      document.removeEventListener('focusout', refresh);
    };
  }, []);
  return revision;
}
