export const THEME_CHANGE_EVENT = 'nukhab-theme-change';
export const THEME_STORAGE_KEY = 'nukhab_theme';
const sessionPreferences = {};

export const getThemeScopeForPath = (pathname = '/', basePath = import.meta.env?.BASE_URL || '/') => {
  const base = basePath.replace(/\/$/, '');
  const route = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  if (route === '/') {
    try { if (window.localStorage.getItem('wajeh_role') === 'student') return 'account'; } catch { /* Default to the public login entry. */ }
    return 'login';
  }
  if (/^\/login\/?$/.test(route)) return 'login';
  return /^\/(dashboard|portal)(\/|$)/.test(route) ? 'account' : 'public';
};

export const getPreferredThemeForPath = (pathname, basePath) => {
  const scope = getThemeScopeForPath(pathname, basePath);
  if (scope === 'login') return 'light';
  let preference = sessionPreferences[scope];
  try {
    preference = window.localStorage.getItem(`${THEME_STORAGE_KEY}_${scope}`) || preference;
  } catch {
    // Retain the in-memory choice when browser storage is unavailable.
    preference = sessionPreferences[scope];
  }
  return preference === 'light' || preference === 'dark'
    ? preference
    : getDefaultThemeForPath(pathname, basePath);
};

export const saveThemePreference = (theme, pathname = window.location.pathname, basePath = undefined) => {
  const scope = getThemeScopeForPath(pathname, basePath);
  const preference = theme === 'light' ? 'light' : 'dark';
  sessionPreferences[scope] = preference;
  try {
    window.localStorage.setItem(`${THEME_STORAGE_KEY}_${scope}`, preference);
  } catch {
    // Navigation still retains the choice for this session without storage.
    return preference;
  }
  return preference;
};

export const getDefaultThemeForPath = (pathname = '/', basePath = import.meta.env?.BASE_URL || '/') => {
  return getThemeScopeForPath(pathname, basePath) === 'public' ? 'dark' : 'light';
};

export const getCurrentTheme = () => (
  document.documentElement.classList.contains('light') ? 'light' : 'dark'
);

export const applyTheme = (theme) => {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.toggle('light', nextTheme === 'light');
  root.classList.toggle('dark', nextTheme === 'dark');
  root.style.colorScheme = nextTheme;
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: nextTheme }));
  return nextTheme;
};
