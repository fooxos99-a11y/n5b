const nukhabColors = {
  dark: {
    background: '176 70% 7%',
    foreground: '175 20% 96%',
    card: '176 55% 11%',
    primaryLight: '38 80% 66%',
    primary: '38 72% 55%',
    primaryDark: '38 72% 45%',
    primaryForeground: '176 80% 9%',
    secondary: '176 42% 17%',
    muted: '175 34% 20%',
    mutedForeground: '175 18% 72%',
    accent: '38 46% 26%',
    border: '175 35% 25%',
  },
  light: {
    background: '175 24% 97%',
    foreground: '176 62% 13%',
    card: '0 0% 100%',
    primaryLight: '175 68% 30%',
    primary: '175 93% 22%',
    primaryDark: '175 95% 16%',
    primaryForeground: '0 0% 100%',
    secondary: '175 32% 92%',
    muted: '175 20% 94%',
    mutedForeground: '175 16% 42%',
    accent: '38 72% 90%',
    border: '175 24% 86%',
  },
};


const nukhabSiteConfig = Object.freeze({
  key: 'nukhab',
  name: 'نخب',
  publicUrl: 'https://nokhab.cc/',
  shortName: 'نخب',
  organizationName: 'نخب',
  description: 'تطبيق نخب',
  logo: 'branding/nukhab/nukhab-color-640.webp',
  logoSmall: 'branding/nukhab/nukhab-color-320.webp',
  whiteLogo: 'branding/nukhab/nukhab-white-640.webp',
  whiteLogoSmall: 'branding/nukhab/nukhab-white-320.webp',
  lockupLogo: 'branding/nukhab/nukhab-color-640.webp',
  squareLogo: 'branding/nukhab/icon-512.png',
  markLogo: 'branding/nukhab/nukhab-color-320.webp',
  icon192: 'branding/nukhab/icon-192.png',
  favicon: 'branding/nukhab/nukhab-logo.svg?v=29',
  appleTouchIcon: 'branding/nukhab/icon-192.png?v=29',
  registrationNumber: 'platform',
  whatsappUrl: '',
  themeColor: '#04433D',
  colors: nukhabColors,
  navigation: {
    background: '#06332f',
    accent: '#f0bd55',
    highlight: '#dfa33b',
  },
  secureStoragePrefix: 'sa.nukhab.app.',
  backgroundRunnerLabel: 'sa.nukhab.app.offline-recitation',
  androidDownloadUrl: '/downloads/nukhab-android-1.0.24.apk',
  appStoreUrl: '',
  features: Object.freeze({
    store: true,
    studentHome: true,
  }),
});


const siteConfigs = Object.freeze({
  nukhab: nukhabSiteConfig,
});

const configuredSiteKey = String(import.meta.env?.VITE_SITE_KEY || 'nukhab').trim().toLowerCase();

export const defaultSiteKey = siteConfigs[configuredSiteKey] ? configuredSiteKey : 'nukhab';

export function getSiteConfig(key = defaultSiteKey) {
  return siteConfigs[String(key || '').trim().toLowerCase()] || nukhabSiteConfig;
}
