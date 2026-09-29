import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { useStartup } from '@/components/startup/StartupProvider';
import { StartupLines } from '@/components/startup/StartupVisual';
import AccountLoginForm from './AccountLoginForm';
import { getStartupTiming } from '@/lib/startupTiming';
import LoadingIndicator from '@/components/ui/loading-indicator';

export default function AccountLoginPage({ site, onLogin, loading }) {
  const startup = useStartup();
  const [timing] = useState(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return getStartupTiming({ active: startup?.active, startedAt: startup?.startedAt, now: performance.now(), reducedMotion: reduced });
  });
  const [entering, setEntering] = useState(timing.duration > 0);
  useEffect(() => {
    const timer = window.setTimeout(() => { setEntering(false); startup?.finish(); }, timing.duration);
    return () => window.clearTimeout(timer);
  }, [startup?.finish, timing.duration]);
  return <>{loading && <LoadingIndicator mode="screen" delayMs={0} />}
  <main hidden={loading} className={`${loading ? '!hidden' : ''} startup-scene px-5 py-10 ${entering ? 'startup-enter' : ''}`} style={{ '--startup-delay': `-${timing.elapsed}ms` }} dir="rtl">
    {entering && <StartupLines />}
    <section className="startup-login-card" aria-labelledby="login-title" aria-busy={entering}>
      {site.logo && <img src={resolveAssetUrl(site.logo)} alt={site.name} className="startup-login-logo" />}
      <header className="startup-login-header"><h1 id="login-title" className="text-2xl font-black text-foreground">تسجيل الدخول</h1></header>
      <div className="startup-login-fields" inert={entering ? '' : undefined} aria-hidden={entering || undefined}>
        <fieldset disabled={entering} className="m-0 min-w-0 border-0 p-0"><AccountLoginForm onLogin={onLogin} loading={loading} autoFocus={false} /></fieldset>
      </div>
    </section>
  </main></>;
}
