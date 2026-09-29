import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesDirectory = new URL('../src/components/dashboard/grades/', import.meta.url);

async function readGradesSources() {
  const names = (await readdir(gradesDirectory)).filter((name) => /\.(?:jsx|js)$/.test(name));
  const entries = await Promise.all(names.map(async (name) => [name, await readFile(new URL(name, gradesDirectory), 'utf8')]));
  return Object.fromEntries(entries);
}

test('the grades page is gone; the weekly and track session pages carry the grades permission', async () => {
  const [dashboard, routes, portal, permissions] = await Promise.all([
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sectionRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/dashboardPermissions.js', import.meta.url), 'utf8'),
  ]);
  const names = await readdir(gradesDirectory);

  for (const removed of ['GradesSection.jsx', 'GradesWeekView.jsx', 'GradesTermView.jsx', 'GradesFacesView.jsx', 'StudentWeekDialog.jsx']) {
    assert.ok(!names.includes(removed), `${removed} must be removed`);
  }
  assert.doesNotMatch(dashboard + portal, /GradesSection|key: 'grades'|case 'grades'/);
  assert.doesNotMatch(routes, /\['grades', 'grades'\]/);
  assert.match(permissions, /key: 'grades', label: 'الجلسة الأسبوعية وجلسة المسار'/);

  assert.match(dashboard, /key: 'trackSession', label: 'جلسة المسار', icon: Route, permissionKey: 'grades'/);
  assert.match(dashboard, /key: 'weeklySession', label: 'الجلسة الأسبوعية', icon: CalendarCheck2, permissionKey: 'grades'/);
  assert.match(dashboard, /case 'trackSession': return <TrackSessionSection \/>/);
  assert.match(dashboard, /case 'weeklySession': return <WeeklySessionSection \/>/);
  assert.match(dashboard, /key: 'trackSession', label: 'جلسة المسار', icon: Route, permissionKey: 'grades', managementOnly: true/);
  assert.match(routes, /\['trackSession', 'track-session'\]/);
  assert.match(routes, /\['weeklySession', 'weekly-session'\]/);
  // Teachers never see the weekly sessions: they are dashboard pages for the manager and administrators.
  assert.doesNotMatch(portal, /weeklySession|trackSession|TrackSessionSection|WeeklySessionSection/);
});

test('management sidebar starts with attendance, the weekly sessions, users, plans and committees', async () => {
  const dashboard = await readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8');
  const order = dashboard.slice(dashboard.indexOf('const managementSectionOrder'), dashboard.indexOf('const reciterSectionOrder'));
  const positions = ["'manualAttendance'", "'weeklySession'", "'trackSession'", 'userSectionKeys', "'studentPlans'", "'families'"].map((key) => order.indexOf(key));
  assert.ok(positions.every((position) => position > 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(dashboard, /managementSectionOrder\.get\(first\.key\)/);
});

test('session pages share the grading API and UI conventions', async () => {
  const sources = await readGradesSources();
  const all = Object.values(sources).join('\n');

  assert.match(all, /gradingApi\.getWeek\(/);
  assert.match(all, /gradingApi\.getPolicy\(/);
  assert.match(all, /gradingApi\.setWeeklyComponent\(/);
  assert.match(sources['TrackSessionSection.jsx'], /policy\?\.trackSession\?\.segmentCount/);
  assert.match(all, /ErrorState/);
  assert.match(all, /DashboardLoader/);
  assert.match(all, /var\(--font-ui\)/);
  assert.doesNotMatch(all, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(all, /console\.(?:log|debug)\(/);
  // Maxima come from the API/policy, never hardcoded totals.
  assert.doesNotMatch(all, /[}\d'"`]\/(?:30|20|100)\b/);
});

test('weekly session page mirrors the track session page without the test', async () => {
  const sources = await readGradesSources();
  const weekly = sources['WeeklySessionSection.jsx'];
  assert.match(weekly, /gradingApi\.setWeeklyComponent\(\{[^}]*component: 'weekly'/);
  assert.match(weekly, /<ManagementPanel>[\s\S]*<ManagementToolbar>[\s\S]*<RelativeWeekNavigator[\s\S]*\{filter && /);
  assert.match(weekly, /<ManagementList label=/);
  assert.match(weekly, /<li key=\{student\.id\} className="flex(?: flex-wrap)? items-center[^"]* px-4 py-3/);
  assert.match(weekly, /allowNone=\{false\}/);
  assert.match(weekly, /<RelativeWeekNavigator/);
  assert.doesNotMatch(weekly, /TrackTestDialog|اختبر/);
});

test('track session page: plans-style rows, present/absent only, segment test with next then save, relative weeks', async () => {
  const sources = await readGradesSources();
  const track = sources['TrackSessionSection.jsx'];
  const dialog = sources['TrackTestDialog.jsx'];
  const navigator = sources['RelativeWeekNavigator.jsx'];

  assert.match(track, /<ManagementPanel>[\s\S]*<ManagementToolbar>[\s\S]*<RelativeWeekNavigator[\s\S]*\{filter && /);
  assert.match(track, /<ManagementList label=/);
  assert.match(track, /<li key=\{student\.id\} className="flex(?: flex-wrap)? items-center[^"]* px-4 py-3/);
  assert.match(track, /allowNone=\{false\}/);
  assert.match(track, /tested && attended !== true/);
  assert.match(dialog, /المقطع السابق/);
  assert.match(track, /present && segmentCount > 0 &&[\s\S]*اختبر/);
  assert.match(track, /recorded: false/);
  assert.match(track, /flex shrink-0 flex-row-reverse items-center gap-2/, 'the test button sits beside absent in RTL');
  assert.match(track, /tested \? 'إعادة الاختبار' : 'اختبر'/);
  assert.doesNotMatch(track, /detail=\{/);
  assert.doesNotMatch(dialog, /detail\?\.segments/);
  assert.doesNotMatch(track, /QuranRangePicker|formatWeekRange/);
  assert.match(dialog, /last \? 'حفظ' : 'التالي'/);
  assert.match(sources['TriStateChoice.jsx'], /allowNone \? OPTIONS : \[OPTIONS\[1\], OPTIONS\[0\]\]/);
  assert.match(dialog, /label="الأخطاء"/);
  assert.match(dialog, /label="التنبيهات"/);
  assert.doesNotMatch(dialog, /QuranRangePicker|range/);
  assert.match(navigator, /week\?\.hasPreviousWeek/);
  assert.match(sources['gradesFormat.js'], /'هذا الأسبوع'/);
  assert.match(sources['gradesFormat.js'], /'الأسبوع الماضي'/);
  assert.match(sources['gradesFormat.js'], /`قبل \$\{offset\} أسابيع`/);

  const route = await readFile(new URL('../server/routes/gradingRoutes.js', import.meta.url), 'utf8');
  assert.match(route, /hasPreviousWeek: await hasEarlierGradingWeek\(studentIds, weekStart\)/);
  assert.match(route, /p\.start_date < \?/);
  assert.match(route, /w\.week_start < \?/);
});

test('teachers have no grading API access and admins need the grades permission', async () => {
  const [server, router] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/gradingRoutes.js', import.meta.url), 'utf8'),
  ]);
  // Students have no weekly grade card, so no grading route is open to them.
  assert.doesNotMatch(server, /gradingAccess|'\/grading\/me'/);
  assert.doesNotMatch(router, /'\/me'/);
  assert.match(server, /\[path\.startsWith\('\/grading'\), \['grades'\]\]/);
  assert.match(router, /const STAFF_ROLES = new Set\(\['manager', 'admin'\]\);/);
  assert.doesNotMatch(router, /supervisor_committees/);
});
