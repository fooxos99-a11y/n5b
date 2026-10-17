import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { enforcePointsFeatureDependencies } from '../shared/points-feature-settings.js';

test('the points system is always on and only its dependent features can be switched off', () => {
  assert.deepEqual(enforcePointsFeatureDependencies({
    pointsSystemEnabled: false,
    studentRankingsVisible: false,
    familyRankingsVisible: false,
    rankingPointsVisible: true,
    storeEnabled: false,
    storePurchaseDeductsRanking: true,
    teacherManualPointsEnabled: true,
  }), {
    pointsSystemEnabled: true,
    rankingsVisible: false,
    studentRankingsVisible: false,
    familyRankingsVisible: false,
    rankingPointsVisible: false,
    storeEnabled: false,
    storePurchaseDeductsRanking: false,
    teacherManualPointsEnabled: true,
  });
  assert.equal(enforcePointsFeatureDependencies({ studentRankingsVisible: true }).rankingsVisible, true);
});

test('family rankings use a seamless Afaneen-style right-to-left marquee', async () => {
  const [marquee, rankings, styles] = await Promise.all([
    readFile(new URL('../src/components/public/FamilyRankingMarquee.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicRankingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(rankings, /import FamilyRankingMarquee/);
  assert.match(rankings, /أفضل الطلاب/);
  assert.ok(rankings.indexOf('<FamilyRankingMarquee') < rankings.indexOf('<StudentRankingList'));
  assert.match(marquee, /dir="ltr"/);
  assert.match(marquee, /data-family-marquee="right-to-left"/);
  assert.match(marquee, /\[false, true\]\.map/);
  assert.match(marquee, /aria-hidden=\{duplicate \|\| undefined\}/);
  assert.match(styles, /@keyframes nukhab-family-marquee[\s\S]*translateX\(-50%\)/);
  assert.match(styles, /animation: nukhab-family-marquee 24s linear infinite/);
});

test('public ranking requests bypass stale pre-reset service-worker entries', async () => {
  const api = await readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8');
  assert.match(api, /PUBLIC_RANKINGS_CACHE_VERSION/);
  assert.match(api, /rankings\/families\?_fresh=\$\{PUBLIC_RANKINGS_CACHE_VERSION\}/);
  assert.match(api, /params\.set\('_fresh', PUBLIC_RANKINGS_CACHE_VERSION\)/);
});

test('public homepage starts with the colored identity and keeps rankings on the second section', async () => {
  const [login, home, hero, rankings] = await Promise.all([
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHome.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicRankings.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(login, /<AccountLoginPage/);
  assert.ok(home.indexOf('<NukhabPublicHero') < home.indexOf('<DeferredPublicRankings'));
  assert.match(hero, /resolveAssetUrl\(site\.logo\)/);
  assert.doesNotMatch(hero, /site\.whiteLogo/);
  assert.doesNotMatch(hero, /brightness-0 invert/);
  assert.match(hero, /min-h-\[82svh\]/);
  assert.match(rankings, /id="public-rankings"/);
  assert.match(rankings, /bg-secondary\/25/);
});

test('standalone homepage keeps Nukhab identity', async () => {
  const [hero, siteConfig] = await Promise.all([
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/site/siteConfigs.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(hero, /site\.heroDescription/);
  assert.match(siteConfig, /نخب/);
});

test('public homepage and account menus omit the removed legal shortcuts', async () => {
  const [login, gateway, home, sidebar, studentHeader, settings, loginHelp] = await Promise.all([
    readFile(new URL('../src/components/public/AccountLoginDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHome.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/home/StudentHomeHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/LoginHelpDialog.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(login, /LegalConsentText|بتسجيل دخولك/);
  assert.match(gateway, /<AccountLoginPage/);
  for (const source of [home, sidebar, studentHeader, settings, loginHelp]) {
    assert.doesNotMatch(source, /PublicLegalFooter|AccountPolicyLinks|المساعدة والخصوصية/);
    assert.doesNotMatch(source, /to="\/(?:terms|privacy|support|account-deletion)"/);
  }
  assert.doesNotMatch(home, /onContact|PublicContactDialog/);
});
