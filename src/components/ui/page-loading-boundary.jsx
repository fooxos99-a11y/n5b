import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScreenLoading } from './screen-loading-provider';
import ScreenLoadingVisual from './screen-loading-visual';

const PageLoadingContext = createContext(null);
export const usePageLoading = () => useContext(PageLoadingContext)?.acquire;

// Keep one scoped indicator across code loading and all initial data loaders.
// Mounted content stays alive so its effects can finish underneath the cover.
export default function PageLoadingBoundary({ children, scope, initialScreen = false, onReady }) {
  const acquireScreen = useScreenLoading();
  const parent = useContext(PageLoadingContext);
  const resolvedScope = scope || parent?.scope || 'screen';
  // Keep the owner stable until this boundary finishes, including nested loaders.
  const [owner] = useState(() => parent?.acquire || ((initialScreen || resolvedScope === 'screen') ? acquireScreen : null));
  const pending = useRef(new Set());
  const frame = useRef(null);
  const release = useRef(null);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  const settle = useCallback(() => {
    cancelAnimationFrame(frame.current);
    if (!mounted.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        if (pending.current.size) return;
        setReady(true);
        release.current?.();
        release.current = null;
      });
    });
  }, []);
  const acquire = useCallback(() => {
    const token = Symbol('page-loading');
    pending.current.add(token);
    cancelAnimationFrame(frame.current);
    return () => { pending.current.delete(token); settle(); };
  }, [settle]);
  useLayoutEffect(() => {
    mounted.current = true;
    release.current = owner?.();
    settle();
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame.current);
      release.current?.();
      release.current = null;
    };
  }, [owner, settle]);
  useEffect(() => { if (ready) onReady?.(); }, [ready, onReady]);
  const value = useMemo(() => ({ acquire: ready ? null : acquire, scope: resolvedScope }), [ready, resolvedScope, acquire]);
  const covered = !ready && !owner;
  return <PageLoadingContext.Provider value={value}>
    {owner ? children : <div className="page-loading-boundary relative min-h-64" aria-busy={!ready}>
      <div className="contents" inert={covered ? '' : undefined} aria-hidden={covered || undefined} style={covered ? { visibility: 'hidden' } : undefined}>{children}</div>
      {covered && <div className={loadingSurfaceClass(resolvedScope)}
        data-loading-indicator={resolvedScope === 'screen' ? 'screen' : 'content'} role="status" aria-live="polite" aria-label="جاري التحميل"><ScreenLoadingVisual /></div>}
    </div>}
  </PageLoadingContext.Provider>;
}

function loadingSurfaceClass(scope) {
  if (scope === 'screen') return 'screen-loading-surface fixed inset-0 z-[1000] grid place-items-center text-[#0ab4a6] [font-family:var(--font-ui)]';
  if (scope === 'dashboard') return 'screen-loading-surface fixed bottom-0 left-0 right-0 top-[68px] z-30 grid place-items-center lg:right-[276px] lg:top-[84px] text-[#0ab4a6] [font-family:var(--font-ui)]';
  return 'screen-loading-surface absolute inset-0 z-30 grid place-items-center text-[#0ab4a6] [font-family:var(--font-ui)]';
}
