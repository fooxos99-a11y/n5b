import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { getSiteConfig } from './src/site/siteConfigs.js';
import { renderSiteMetadata } from './src/site/siteMetadata.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.BASE_URL || '/';
  const site = getSiteConfig(env.VITE_SITE_KEY);
  const nativeBuild = mode.includes('mobile') || process.env.VITE_NATIVE_APP === 'true';
  let resolvedOutDir = '';
  return {
  base,
  plugins: [
    react(),
    {
      name: 'site-branding',
      transformIndexHtml(html) {
        const _resolveHeroPreload = () => {
          if (site.showPublicHeroLogo === false) {
            return '';
          }
          const responsiveImages = site.logoSmall ? ` imagesrcset="${base}${site.logoSmall} 320w, ${base}${site.logo} 640w" imagesizes="min(72vw, 320px)"` : '';
          return `<link data-brand-hero-preload rel="preload" href="${base}${site.logo}" as="image"${responsiveImages} fetchpriority="high" />`;
        };
        const heroPreload = _resolveHeroPreload();
        return html
          .replace(/<title>.*?<\/title>/, `<title>${site.name}</title>`)
          .replace(/<meta name="description" content="[^"]*"\s*\/>/, renderSiteMetadata(site))
          .replace(/(<link rel="icon" type="image\/png" href=")[^"]*(")/, `$1${base}${site.favicon}$2`)
          .replace(/(<link rel="apple-touch-icon" href=")[^"]*(")/, `$1${base}${site.appleTouchIcon}$2`)
          .replace(/<link data-brand-hero-preload[^>]*\/>/, heroPreload)
          .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${site.shortName}$2`)
          .replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${site.themeColor}$2`);
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.webmanifest',
          source: JSON.stringify({
            name: site.name,
            short_name: site.shortName,
            description: site.description,
            lang: 'ar',
            dir: 'rtl',
            start_url: '.',
            scope: '.',
            display: 'standalone',
            orientation: 'portrait-primary',
            background_color: site.colors.dark.background.startsWith('#') ? site.colors.dark.background : '#071018',
            theme_color: site.themeColor,
            icons: [
              { src: site.icon192, sizes: site.icon192Sizes || '192x192', type: 'image/png', purpose: 'any' },
              { src: site.squareLogo, sizes: site.squareLogoSizes || '512x512', type: 'image/png', purpose: 'any' },
            ],
          }, null, 2),
        });
      },
    },
    {
      name: 'exclude-download-artifacts-from-native-builds',
      apply: 'build',
      configResolved(config) {
        resolvedOutDir = config.build.outDir;
      },
      closeBundle() {
        if (!nativeBuild || !resolvedOutDir) return;
        rmSync(path.resolve(process.cwd(), resolvedOutDir, 'downloads'), { recursive: true, force: true });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3002',
    },
  },
  build: {
    // LiveKit is isolated behind a lazy route; it does not affect initial dashboard loading.
    chunkSizeWarningLimit: 600,
  },
  };
});
