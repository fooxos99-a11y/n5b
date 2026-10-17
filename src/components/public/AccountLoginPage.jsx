import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { useStartup } from '@/components/startup/StartupProvider';
import AccountLoginForm from './AccountLoginForm';
import { getStartupTiming } from '@/lib/startupTiming';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { trackLoginViewport } from '@/lib/loginViewport';
import { applyTheme, getCurrentTheme } from '@/lib/theme';
import './account-login.css';

export default function AccountLoginPage({ site, onLogin, loading }) {
  const startup = useStartup();
  const [timing] = useState(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return getStartupTiming({ active: startup?.active, startedAt: startup?.startedAt, now: performance.now(), reducedMotion: reduced });
  });
  const entering = Boolean(startup?.active);
  const contentRef = useRef(null);
  useLayoutEffect(() => {
    const previousTheme = getCurrentTheme();
    if (previousTheme !== 'light') applyTheme('light');
    return () => { if (previousTheme !== 'light') applyTheme(previousTheme); };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('account-login-active');
    const stopTracking = trackLoginViewport(window, root, contentRef.current);
    return () => {
      stopTracking();
      root.classList.remove('account-login-active');
    };
  }, []);
  return <>{loading && <LoadingIndicator mode="screen" delayMs={0} />}
  <main hidden={loading} className={`${loading ? '!hidden' : ''} account-login-page ${entering ? 'account-login-enter' : ''}`} style={{ '--startup-delay': `-${timing.elapsed}ms` }} dir="rtl">
    <section ref={contentRef} className="account-login-content" aria-labelledby="login-title" aria-busy={entering}>
      <header className="account-login-header">
        {site.logo && <img src={resolveAssetUrl(site.logo)} alt={site.name} className="account-login-logo" />}
        <h1 id="login-title">برنامج نخب التعليمي</h1>
        <p>سجل دخولك للمتابعة</p>
      </header>
      <div className="account-login-fields" inert={entering ? '' : undefined} aria-hidden={entering || undefined}>
        <fieldset disabled={entering} className="m-0 min-w-0 border-0 p-0"><AccountLoginForm onLogin={onLogin} loading={loading} autoFocus={false} /></fieldset>
      </div>
    </section>
  </main></>;
}
