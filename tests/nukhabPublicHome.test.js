import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web products share the formal responsive homepage with both themes', async () => {
  const [gateway, home, header, hero, rankings, portal, routes] = await Promise.all([
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHome.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicRankings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(gateway, /<AccountLoginPage/);
  assert.doesNotMatch(gateway, /<PublicHeroSection|<PublicRankingsSection|site\.key === 'nukhab'/);
  assert.match(home, /NukhabPublicHeader/);
  assert.match(home, /NukhabPublicHero/);
  assert.doesNotMatch(hero, /showPath|showDailyChallenge|الخريطة|التحدي اليومي/);
  assert.doesNotMatch(hero, /data-public-primary-actions/);
  assert.doesNotMatch(hero, /عرض لوحة التميز|sm:flex-wrap|flex-col justify-center/);
  assert.doesNotMatch(header, /الترتيب|public-rankings/);
  // Students never execute tasks: no execution section, button or dialog anywhere in the student experience.
  assert.doesNotMatch(portal, /hasStudentQuranExecution !== false|activeSection === 'quranExecution'|studentExecutionLivesOnPublicHome/);
  assert.doesNotMatch(gateway, /executionEnabled|studentExecutionEnabled/);
  assert.doesNotMatch(home, /QuranExecutionDialog|executionOpen/);
  assert.doesNotMatch(hero, /onOpenExecution|التنفيذ/);
  assert.doesNotMatch(header, /showPath|showDailyChallenge|الخريطة|التحدي اليومي|>الرئيسية</);
  assert.match(home, /DeferredPublicRankings/);
  assert.doesNotMatch(routes, /quranExecution/);
  assert.match(header, /ThemeToggle/);
  assert.match(header, /min-h-11/);
  assert.match(header, /mr-auto flex shrink-0 items-center/);
  assert.match(header, /<ThemeToggle[\s\S]*onClick=\{onOpenAccount\}[\s\S]*hasSession \? 'حسابي' : 'تسجيل الدخول'/);
  assert.match(header, /تسجيل الدخول/);
  assert.doesNotMatch(hero, /تسجيل الدخول/);
  assert.doesNotMatch(hero, /حسابي/);
  assert.doesNotMatch(hero, /onOpenAccount/);
  assert.match(hero, /resolveAssetUrl\(site\.logo\)/);
  assert.doesNotMatch(hero, /site\.whiteLogo|dark:hidden/);
  assert.match(hero, /site\.organizationName/);
  assert.doesNotMatch(hero, /إدارة المسيرة|الخطة القرآنية|التحضير والتسميع|التقارير في واجهة/);
  assert.match(rankings, /lg:grid-cols-2/);
  assert.doesNotMatch(rankings, /FeaturedRankingCard|featuredPlacement|grid-cols-2 justify-items-center/);
  assert.match(rankings, /topRankMeta/);
  assert.match(rankings, /1: \{[\s\S]*?label: 'المركز الأول',[\s\S]*?icon: Crown/);
  assert.match(rankings, /2: \{[\s\S]*?label: 'المركز الثاني',[\s\S]*?icon: Award/);
  assert.match(rankings, /3: \{[\s\S]*?label: 'المركز الثالث',[\s\S]*?icon: Award/);
  assert.match(rankings, /rows\.slice\(0, 8\)\.map/);
  assert.match(rankings, /min-h-\[4\.25rem\]/);
  assert.match(rankings, /rounded-2xl border px-4 py-2\.5/);
  assert.match(rankings, /space-y-2\.5 px-3 pb-4/);
  assert.match(rankings, /text-sm font-black tabular-nums text-muted-foreground/);
  assert.doesNotMatch(rankings, /title, icon: Icon/);
  assert.doesNotMatch(rankings, /title="أفضل الحلقات" icon=/);
  assert.doesNotMatch(rankings, /title="أفضل الطلاب" icon=/);
  assert.match(rankings, /border-amber-400\/80/);
  assert.match(rankings, /border-sky-400\/75/);
  assert.match(rankings, /border-orange-400\/80/);
  assert.match(rankings, /absolute inset-y-3 right-0 w-1 rounded-l-full/);
  assert.doesNotMatch(rankings, /rounded-full border border-primary\/25 bg-gradient-to-br/);
  assert.match(rankings, /studentRankingsVisible/);
  assert.match(rankings, /familyRankingsVisible/);
  assert.doesNotMatch(rankings, /عرض واضح|أعلى النتائج المسجلة/);
  assert.match([home, header, hero, rankings].join('\n'), /var\(--font-ui\)/);
});
