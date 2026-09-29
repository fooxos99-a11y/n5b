import { useStartup } from '@/components/startup/StartupProvider';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ScreenLoadingVisual from './screen-loading-visual';

const ScreenLoadingContext = createContext(null);
export const useScreenLoading = () => useContext(ScreenLoadingContext);

export default function ScreenLoadingProvider({ children }) {
  const startup = useStartup();
  const finishStartup = startup?.finish;
  const requests = useRef(new Set());
  const timer = useRef(null);
  const [visible, setVisible] = useState(false);
  const acquire = useCallback(() => {
    const token = Symbol('screen-loading');
    requests.current.add(token);
    window.clearTimeout(timer.current);
    timer.current = null;
    setVisible(true);
    return () => {
      requests.current.delete(token);
      if (requests.current.size) return;
      // Keep the same spinner mounted across consecutive route/data loading stages.
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (!requests.current.size) {
          setVisible(false);
          if (localStorage.getItem('wajeh_role')) finishStartup?.();
        }
      }, 180);
    };
  }, [finishStartup]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <ScreenLoadingContext.Provider value={acquire}>
    <div className="contents" inert={visible ? '' : undefined} aria-hidden={visible || undefined}>{children}</div>
    {visible && createPortal(<div className="screen-loading-surface fixed inset-0 z-[1000] grid place-items-center text-[#0ab4a6] [font-family:var(--font-ui)]" data-loading-indicator="screen" role="status" aria-live="polite" aria-label="جاري التحميل"><ScreenLoadingVisual /></div>, document.body)}
  </ScreenLoadingContext.Provider>;
}
