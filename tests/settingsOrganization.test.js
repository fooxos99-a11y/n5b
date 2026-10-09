import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manager settings keep store and programs activation in their own pages', async () => {
  const [settings, navigation, dashboard, sidebar] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/settingsNavigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
  ]);
  const titles = [...navigation.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);

  assert.deepEqual(titles, [
    'البرنامج الأسبوعي',
    'جلسة المسار',
    'الجلسة الأسبوعية',
    'يوم السرد',
    'الاجتياز',
    'النقاط والترتيب',
    'إعدادات الإشعارات',
    'إنهاء الفصل وطلبات الحذف',
  ]);
  assert.match(dashboard, /children: settingsNavigationItems/);
  assert.match(sidebar, /section\.children\.map/);
  assert.equal((navigation.match(/icon: /g) || []).length, 8);
  assert.match(sidebar, /const ChildIcon = child\.icon/);
  assert.doesNotMatch(sidebar, /h-1\.5 w-1\.5 shrink-0 rounded-full/);
  assert.doesNotMatch(settings, /SettingsDisclosure/);
  assert.doesNotMatch(settings, /registration-(?:pre-accept|accept|reject)-template/);
  assert.doesNotMatch(settings, /category="settingsStore"|category="settingsPrograms"/);
  assert.doesNotMatch(settings, /خصم النقاط من الترتيب عند الشراء من المتجر|settingsMap|settingsNazem/);
});

test('registration templates are managed from notification settings', async () => {
  const [requests, dialog] = await Promise.all([
    readFile(new URL('../src/components/dashboard/RegistrationRequestsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/NotificationSettings.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(requests, /<RegistrationTemplatesDialog \/>/);
  assert.match(dialog, /قوالب التسجيل/);
  assert.match(dialog, /registrationPreAcceptTemplate/);
  assert.match(dialog, /registrationAcceptTemplate/);
  assert.match(dialog, /registrationRejectTemplate/);
  assert.match(dialog, /settings,setSettings/);
  assert.match(dialog, /setSettings\(\{\.\.\.settings/);
});

test('legacy teacher rating options are removed from settings and persisted data', async () => {
  const [settings, server, database, migration] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.25.5-remove-teacher-rating-options.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(`${settings}\n${server}\n${database}`, /teacherRatingOptions|normalizeTeacherRatingOptions/);
  assert.match(migration, /DELETE FROM app_settings WHERE setting_key = 'teacherRatingOptions'/);
});
