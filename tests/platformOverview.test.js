import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculatePlanRates, resolveAnalyticsPeriod, resolveOverviewPeriod } from '../server/services/platformOverview.js';
import { applyPlatformPolicies } from '../server/services/platformSettingPolicies.js';

test('platform overview period accepts only supported ranges', () => {
  assert.equal(resolveOverviewPeriod(1).days, 1);
  assert.equal(resolveOverviewPeriod(7).days, 7);
  assert.equal(resolveOverviewPeriod(30).days, 30);
  assert.equal(resolveOverviewPeriod(999).days, 30);
});

test('platform analytics keeps comparison optional and shifts the selected range by the requested preset', () => {
  const period = resolveAnalyticsPeriod({ from: '2026-08-01', to: '2026-08-15' });
  assert.deepEqual(period, {
    from: '2026-08-01',
    to: '2026-08-15',
    days: 15,
    comparison: null,
    previous: null,
  });
  assert.deepEqual(resolveAnalyticsPeriod({ from: '2026-08-01', to: '2026-08-15', compare: 'week' }).previous, {
    from: '2026-07-25', to: '2026-08-08', days: 15,
  });
  assert.deepEqual(resolveAnalyticsPeriod({ from: '2026-03-31', to: '2026-03-31', compare: 'month' }).previous, {
    from: '2026-03-01', to: '2026-03-01', days: 1,
  });
  assert.throws(() => resolveAnalyticsPeriod({ from: '2026-08-15', to: '2026-08-01' }), /نطاق التاريخ/);
  assert.throws(() => resolveAnalyticsPeriod({ from: '2025-01-01', to: '2026-08-01' }), /366/);
  assert.throws(() => resolveAnalyticsPeriod({ from: '2026-08-01', to: '2026-08-15', compare: 'invalid' }), /فترة المقارنة/);
});

test('plan progress uses the full target while daily adherence uses only work due to date', () => {
  assert.deepEqual(calculatePlanRates({
    planTargetFaces: 100,
    planCompletedFaces: 10,
    planDueFaces: 10,
    planDueCompletedFaces: 10,
  }), { planProgressRate: 10, planAdherenceRate: 100 });
  assert.deepEqual(calculatePlanRates({
    planTargetFaces: 100,
    planCompletedFaces: 5,
    planDueFaces: 10,
    planDueCompletedFaces: 5,
  }), { planProgressRate: 5, planAdherenceRate: 50 });
});

test('platform setting policies enforce owner decisions and preserve tenant choices', () => {
  assert.deepEqual(applyPlatformPolicies({
    storeEnabled: false,
    reportsSectionEnabled: true,
    narrationMaxScore: 90,
  }, {
    storeEnabled: 'enabled',
    reportsSectionEnabled: 'disabled',
    narrationMaxScore: 'tenant',
  }), {
    storeEnabled: true,
    reportsSectionEnabled: false,
    narrationMaxScore: 90,
  });
});

test('platform owner overview aggregates tenants safely and exposes responsive drill-down views', async () => {
  const [routes, service, settingsService, settingsCatalog, policySetting, dbSource, server, api, page, analytics, settings, filters, metric, table, chart, details, complexes, complexCard, errorState] = await Promise.all([
    readFile(new URL('../server/platformRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/platformOverview.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/platformSettings.js', import.meta.url), 'utf8'),
    readFile(new URL('../shared/platform-settings-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerPolicySetting.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/platformApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PlatformOwner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerAnalyticsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerSettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerAnalyticsFilters.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerMetricCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerComplexAnalyticsTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerTrendChart.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerComplexDetailsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerComplexesSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerComplexCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerErrorState.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(routes, /router\.get\('\/overview', requirePlatformOwner/);
  assert.match(routes, /router\.get\('\/analytics', requirePlatformOwner/);
  assert.match(routes, /router\.get\('\/settings\/:complexId', requirePlatformOwner/);
  assert.match(routes, /router\.put\('\/settings', requirePlatformOwner/);
  assert.match(routes, /router\.get\('\/complexes\/:id\/overview', requirePlatformOwner/);
  assert.match(routes, /const publicComplex = \{ \.\.\.complex \};\s*delete publicComplex\.databaseName/);
  assert.match(service, /runWithDatabase/);
  assert.match(service, /mapComplexesWithLimit/);
  assert.match(service, /resolveAnalyticsPeriod/);
  assert.match(service, /previousStats/);
  assert.doesNotMatch(service, /student_quran_tests|testsCount/);
  assert.match(service, /planProgressRate/);
  assert.match(service, /planAdherenceRate/);
  assert.match(service, /supervisor_committees/);
  assert.match(service, /BETWEEN \? AND \?/);
  assert.doesNotMatch(service, /SELECT \*/);
  assert.match(api, /getOverview/);
  assert.match(api, /getAnalytics/);
  assert.match(api, /getSettings/);
  assert.match(api, /updateSettings/);
  assert.match(api, /getComplexOverview/);

  assert.match(page, /label: 'الإحصائيات'/);
  assert.match(page, /label: 'المجمعات'/);
  assert.match(page, /label: 'الإعدادات'/);
  assert.match(page, /OwnerSettingsSection/);
  assert.match(page, /\/dashboard\/platform\/complex-\$\{id\}/);
  assert.match(analytics, /ترتيب المجمعات/);
  assert.match(analytics, /تحتاج إلى متابعة/);
  assert.doesNotMatch(analytics, /تتحدث جميع المؤشرات|الفترة السابقة للمقارنة/);
  assert.doesNotMatch(analytics, /كيف تغير عدد الطلاب|هل يتحسن انتظام الطلاب|ما حجم الإنجاز اليومي|المجمعات المقروءة|ملاحظة بيانات/);
  assert.match(analytics, /label="المجمعات"/);
  assert.match(analytics, /تنفيذ مهام الفترة/);
  assert.match(analytics, /إنجاز الخطة/);
  assert.match(analytics, /الالتزام حتى اليوم/);
  assert.match(analytics, /OwnerTrendChart/);
  assert.doesNotMatch(service, /\bAS repeat[,\s]/);
  assert.match(service, /AS repeatFaces/);
  assert.match(analytics, /key: 'repeatFaces'/);
  assert.doesNotMatch(filters, /اختيار متعدد/);
  assert.match(filters, /مقارنة مع/);
  assert.match(filters, /بدون مقارنة/);
  assert.match(filters, /value="2years">سنتين/);
  assert.match(metric, /hasComparison/);
  assert.match(metric, /عن فترة المقارنة/);
  assert.doesNotMatch(analytics, /previousValue=\{rows\.length\}/);
  assert.match(filters, /import DatePicker from '@\/components\/ui\/date-picker'/);
  assert.match(filters, /ariaLabel="من تاريخ"/);
  assert.match(filters, /ariaLabel="إلى تاريخ"/);
  assert.match(filters, /جميع الحلق/);
  assert.match(filters, /جميع مشرفي المسارات/);
  assert.match(table, /تحليلات-المجمعات\.csv/);
  assert.match(table, /overflow-x-auto/);
  assert.match(chart, /role="img"/);
  assert.match(chart, /ArrowDown, ArrowUp, Minus/);
  assert.doesNotMatch(chart, /question/);
  assert.match(settingsCatalog, /text\('quranPlanStartDate', 'البداية'/);
  assert.match(settingsCatalog, /PLATFORM_POLICY_VALUES/);
  assert.match(settings, /حفظ لجميع المجمعات/);
  assert.match(policySetting, /MultiSelectSetting/);
  assert.match(policySetting, /اختياري من قبل المجمع/);
  assert.match(settingsService, /allowedKeys/);
  assert.match(settingsService, /INSERT INTO app_settings/);
  assert.match(dbSource, /start_date/);
  assert.match(dbSource, /target_end_date/);
  assert.match(server, /startDate: row\.startDate \|\| row\.createdDate/);
  assert.match(server, /adherencePercent/);
  assert.match(details, /الحضور/);
  assert.match(details, /تنفيذ مهام الفترة/);
  assert.match(details, /آخر النشاطات/);
  assert.match(details, /الحلقات/);
  assert.match(complexes, /OwnerComplexToolbar/);
  assert.match(complexes, /onOpenComplex/);
  assert.match(complexCard, /onOpen\(complex\.id\)/);
  assert.match(complexCard, /provisioningError/);
  assert.match(analytics, /OwnerErrorState/);
  assert.match(details, /OwnerErrorState/);
  assert.match(errorState, /إعادة المحاولة/);
});
