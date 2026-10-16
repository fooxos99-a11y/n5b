(() => {
  const base = (globalThis.document.currentScript?.dataset.base || '').replace(/\/$/, '');
  const pathname = globalThis.location.pathname;
  const route = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const publicRegistration = route === '/' && new globalThis.URLSearchParams(globalThis.location.search || '').get('registration') === '1';
  let studentHome = false;
  try { studentHome = !publicRegistration && route === '/' && globalThis.localStorage.getItem('wajeh_role') === 'student'; } catch { /* Storage can be unavailable. */ }
  const scope = studentHome || /^\/(dashboard|portal)(\/|$)/.test(route) ? 'account' : 'public';
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
