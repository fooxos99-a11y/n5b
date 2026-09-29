import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from '@/lib/router';
import { Capacitor } from '@capacitor/core';
import App from '@/App';
import ScrollToTop from '@/components/ScrollToTop';
import { SiteProvider } from '@/site/SiteProvider';
import { getSiteConfig } from '@/site/siteConfigs';
import { applyTheme, getPreferredThemeForPath } from '@/lib/theme';
import { recoverFromStaleAppAsset } from '@/lib/appVersionRecovery';
import '@/index.css';

const NativeAppBridge = React.lazy(() => import('@/components/native/NativeAppBridge'));

const initialTheme = applyTheme(getPreferredThemeForPath(window.location.pathname));

const initialSite = getSiteConfig();
const initialColors = initialSite.colors?.[initialTheme] || {};
const initialColorVars = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  primaryLight: '--primary-light',
  primary: '--primary',
  primaryDark: '--primary-dark',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  border: '--border',
};
Object.entries(initialColorVars).forEach(([key, cssVar]) => {
  if (initialColors[key]) document.documentElement.style.setProperty(cssVar, initialColors[key]);
});
if (initialColors.card) {
  document.documentElement.style.setProperty('--card-foreground', initialColors.foreground || '');
  document.documentElement.style.setProperty('--popover', initialColors.card);
  document.documentElement.style.setProperty('--popover-foreground', initialColors.foreground || '');
}
if (initialColors.accent) document.documentElement.style.setProperty('--accent-foreground', initialColors.primaryForeground || '');
if (initialColors.border) {
  document.documentElement.style.setProperty('--input', initialColors.border);
  document.documentElement.style.setProperty('--ring', initialColors.primary || initialColors.border);
}
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', initialSite.themeColor || '#04433D');
document.documentElement.style.setProperty('--brand-navigation', initialSite.navigation?.background || '#06332f');
document.documentElement.style.setProperty('--brand-navigation-accent', initialSite.navigation?.accent || '#f0bd55');
document.documentElement.style.setProperty('--brand-navigation-highlight', initialSite.navigation?.highlight || '#dfa33b');
document.title = initialSite.name || document.title;

const pwaVersion = `${initialSite.key}-pwa-v38`;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  recoverFromStaleAppAsset(event.payload);
});

const buildBasePath = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '');
const routerBasename = buildBasePath
  && (window.location.pathname === buildBasePath
    || window.location.pathname.startsWith(`${buildBasePath}/`))
  ? buildBasePath
  : undefined;

const isLocalDev = import.meta.env.DEV
  || Capacitor.isNativePlatform()
  || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const runServiceWorkerSetup = () => {
  if (!('serviceWorker' in navigator)) return;

  if (isLocalDev) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }
    return;
  }

  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?brand=${encodeURIComponent(initialSite.key)}`)
    .then((registration) => {
      const versionStorageKey = `${initialSite.key}_pwa_version`;
      if (localStorage.getItem(versionStorageKey) !== pwaVersion) {
        localStorage.setItem(versionStorageKey, pwaVersion);
      }
      registration.update().catch(() => {});
    })
    .catch(() => {});
};

const scheduleServiceWorkerSetup = () => {
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runServiceWorkerSetup, { timeout: 4000 });
      return;
    }
    window.setTimeout(runServiceWorkerSetup, 2500);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
};

const mountApp = () => {
  const appRoot = document.getElementById('app-root');
  if (!appRoot || appRoot.dataset.mounted === 'true') return;
  appRoot.dataset.mounted = 'true';
  let observer;
  const revealTimeout = window.setTimeout(() => {
    document.documentElement.classList.add('app-ready');
    observer?.disconnect();
  }, 6000);

  const revealWhenScreenIsReady = () => {
    if (!appRoot.firstElementChild) return;
    if (appRoot.querySelector('[data-loading-indicator="screen"]')) return;
    window.requestAnimationFrame(() => document.documentElement.classList.add('app-ready'));
    window.clearTimeout(revealTimeout);
    observer?.disconnect();
  };

  observer = new MutationObserver(revealWhenScreenIsReady);
  observer.observe(appRoot, { childList: true, subtree: true });

  ReactDOM.createRoot(appRoot).render(
    <BrowserRouter
        basename={routerBasename}
      >
        <SiteProvider>
          <ScrollToTop />
          {Capacitor.isNativePlatform() && (
            <React.Suspense fallback={null}><NativeAppBridge /></React.Suspense>
          )}
          <App />
        </SiteProvider>
      </BrowserRouter>
  );
  window.requestAnimationFrame(revealWhenScreenIsReady);
};

mountApp();
scheduleServiceWorkerSetup();
