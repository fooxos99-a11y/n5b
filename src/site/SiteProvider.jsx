import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSiteConfig } from '@/site/siteConfigs';
import {
  getApiBase,
  getTenantRegistrationNumber,
} from '@/services/apiBase';
import { preloadSiteBrandAssets } from '@/lib/preloadBrandAssets';

const SiteContext = createContext(getSiteConfig());

const colorVarMap = {
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

function applySiteTheme(config) {
  const root = document.documentElement;
  const mode = root.classList.contains('light') ? 'light' : 'dark';
  const colors = config.colors?.[mode] || {};

  Object.entries(colorVarMap).forEach(([key, cssVar]) => {
    if (colors[key]) root.style.setProperty(cssVar, colors[key]);
  });

  if (colors.card) {
    root.style.setProperty('--card-foreground', colors.foreground || '');
    root.style.setProperty('--popover', colors.card);
    root.style.setProperty('--popover-foreground', colors.foreground || '');
  }
  if (colors.accent) root.style.setProperty('--accent-foreground', colors.primaryForeground || '');
  if (colors.border) {
    root.style.setProperty('--input', colors.border);
    root.style.setProperty('--ring', colors.primary || colors.border);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', config.themeColor || '#04433D');
  root.style.setProperty('--brand-navigation', config.navigation?.background || '#06332f');
  root.style.setProperty('--brand-navigation-accent', config.navigation?.accent || '#f0bd55');
  root.style.setProperty('--brand-navigation-highlight', config.navigation?.highlight || '#dfa33b');
  document.title = config.name || 'المنصة';
}

export function SiteProvider({ children }) {
  const [siteConfig, setSiteConfig] = useState(() => getSiteConfig());

  useEffect(() => {
    let controller;
    const loadSiteConfig = () => {
      controller?.abort();
      controller = new AbortController();
      const queryRegistration = new URLSearchParams(window.location.search).get('registrationNumber')?.trim();
      const registrationNumber = queryRegistration || getTenantRegistrationNumber();
      const query = registrationNumber
        ? `?registrationNumber=${encodeURIComponent(registrationNumber)}`
        : '';
      fetch(`${getApiBase()}/site-config${query}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: registrationNumber ? { 'X-Registration-Number': registrationNumber } : {},
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(async (config) => {
          if (config?.key) {
            const defaults = getSiteConfig(config.key);
            const nextConfig = { ...defaults, ...config, features: { ...defaults.features, ...config.features } };
            await preloadSiteBrandAssets(nextConfig);
            setSiteConfig(nextConfig);
          }
        })
        .catch(() => {});
    };
    loadSiteConfig();
    window.addEventListener('nukhab-tenant-change', loadSiteConfig);
    return () => {
      window.removeEventListener('nukhab-tenant-change', loadSiteConfig);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    applySiteTheme(siteConfig);
    const observer = new MutationObserver(() => applySiteTheme(siteConfig));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [siteConfig]);

  const value = useMemo(() => siteConfig, [siteConfig]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteContext);
}
