import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('initial public load defers non-critical work and uses compact responsive assets', async () => {
  const [app, main, home, deferredRankings, hero, serviceWorker, html, styles] = await Promise.all([
    read('../src/App.jsx'),
    read('../src/main.jsx'),
    read('../src/components/public/nukhab/NukhabPublicHome.jsx'),
    read('../src/components/public/nukhab/DeferredPublicRankings.jsx'),
    read('../src/components/public/nukhab/NukhabPublicHero.jsx'),
    read('../public/sw.js'),
    read('../index.html'),
    read('../src/index.css'),
  ]);

  assert.match(app, /lazy\(\(\) => import\('@\/components\/native\/OfflineRecitationSyncBridge'\)\)/);
  assert.match(main, /requestIdleCallback/);
  assert.match(main, /lazy\(\(\) => import\('@\/components\/native\/NativeAppBridge'\)\)/);
  assert.match(home, /<DeferredPublicRankings/);
  assert.match(deferredRankings, /IntersectionObserver/);
  assert.doesNotMatch(hero, /framer-motion|motion\./);
  assert.doesNotMatch(serviceWorker, /summit\/(?:mountain|forest|cave)/);
  assert.match(html, /imagesrcset=/);
  assert.match(html, /cairo-arabic\.woff2/);
  assert.doesNotMatch(html, /Cairo-(?:Regular|Bold)\.ttf/);
  assert.match(styles, /font-weight: 400 900/);
});

test('rankings and dashboard bootstrap avoid unnecessary initial requests and rows', async () => {
  const [server, dashboard, api] = await Promise.all([
    read('../server/index.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/services/studentsApi.js'),
  ]);

  assert.match(server, /app\.get\('\/api\/dashboard-bootstrap'/);
  assert.match(server, /ranked WHERE position <= 8 OR id = \?/);
  assert.match(server, /rankFamilies\(rows, settings\.familyRankingMode\)\.slice\(0, 8\)/);
  assert.match(api, /getDashboardBootstrap: \(\) => request\('\/dashboard-bootstrap'\)/);
  assert.match(dashboard, /studentsApi\.getDashboardBootstrap\(\)/);
  assert.doesNotMatch(dashboard, /Promise\.all\(\[\s*studentsApi\.getPublicSettings/);
  assert.match(dashboard, /dashboardSectionPreloaders\[preloadKey\]/);
});
