(() => {
  // Set the iOS viewport before the first logo paint; the later native bridge must not resize it.
  if (globalThis.Capacitor?.getPlatform?.() === 'ios') {
    const viewport = globalThis.document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const parts = (viewport.getAttribute('content') || 'width=device-width, initial-scale=1').split(',')
        .filter(part => !part.trim().startsWith('viewport-fit='));
      viewport.setAttribute('content', [...parts, 'viewport-fit=cover'].join(','));
    }
  }
  const base = (globalThis.document.currentScript?.dataset.base || '').replace(/\/$/, '');
  const pathname = globalThis.location.pathname;
  const route = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const publicRegistration = route === '/' && new globalThis.URLSearchParams(globalThis.location.search || '').get('registration') === '1';
  let studentHome = false;
  try { studentHome = !publicRegistration && route === '/' && globalThis.localStorage.getItem('wajeh_role') === 'student'; } catch { /* Storage can be unavailable. */ }
  const scope = studentHome || /^\/(dashboard|portal|passing-entry)(\/|$)/.test(route) ? 'account' : 'public';
  let preference;
  try {
    preference = globalThis.localStorage.getItem(`nukhab_theme_${scope}`);
  } catch {
    preference = null;
  }
  const _resolveTheme = () => {
    if ((!studentHome && !publicRegistration && route === '/') || /^\/login\/?$/.test(route)) {
      return 'light';
    }
    if (preference === 'light' || preference === 'dark') {
      return preference;
    }
    if (scope === 'account') {
      return 'light';
    }
    return 'dark';
  };
  const theme = _resolveTheme();
  globalThis.document.documentElement.classList.add(theme);
  globalThis.document.documentElement.style.colorScheme = theme;
})();
