import { StartupSplash } from '@/components/startup/StartupVisual';
import { getSiteConfig } from '@/site/siteConfigs';
import { useStartup } from '@/components/startup/StartupProvider';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ScreenLoadingVisual from './screen-loading-visual';

const ScreenLoadingContext = createContext(null);
export const useScreenLoading = () => useContext(ScreenLoadingContext);

export default function ScreenLoadingProvider({ children }) {
  const startup = useStartup();
  const finishStartup = startup?.finish;
  const [visible, setVisible] = useState(false);
  const [signedInAtLaunch] = useState(() => Boolean(localStorage.getItem('wajeh_role')));
  const [animationDone, setAnimationDone] = useState(false);
  const showStartup = signedInAtLaunch && startup?.active;
  useEffect(() => {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2000;
    const timeout = window.setTimeout(() => setAnimationDone(true), duration);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (showStartup && animationDone && !visible) finishStartup?.();
  }, [showStartup, animationDone, visible, finishStartup]);
  const requests = useRef(new Set());
  const timer = useRef(null);
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
        }
      }, 180);
    };
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <ScreenLoadingContext.Provider value={acquire}>
    <div className="contents" inert={visible || showStartup ? '' : undefined} aria-hidden={visible || showStartup || undefined}>{children}</div>
    {showStartup && createPortal(<StartupSplash site={getSiteConfig()} hold />, document.body)}
    {visible && !showStartup && createPortal(<div className="screen-loading-surface fixed inset-0 z-[1000] grid place-items-center text-[#0ab4a6] [font-family:var(--font-ui)]" data-loading-indicator="screen" data-startup={startup?.active || undefined} role="status" aria-live="polite" aria-label="جاري التحميل"><ScreenLoadingVisual /></div>, document.body)}
  </ScreenLoadingContext.Provider>;
}
