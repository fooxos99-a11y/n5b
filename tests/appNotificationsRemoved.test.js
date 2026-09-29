import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('legacy notification polling and Nazem alert producers stay removed after adding explicit broadcasts', async () => {
  const [server, portal, dashboard, api, routes, serverPermissions, clientPermissions, catalog] = await Promise.all([
    read('../server/index.js'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/services/studentsApi.js'),
    read('../src/lib/sectionRoutes.js'),
    read('../server/services/dashboardPermissions.js'),
    read('../src/lib/dashboardPermissions.js'),
    read('../shared/platform-settings-catalog.js'),
  ]);

  for (const source of [server, portal, dashboard, api, routes, serverPermissions, clientPermissions, catalog]) {
    assert.doesNotMatch(source, /useAppNotificationPolling|createDirectAppNotification|notificationsSectionEnabled|notifyStaleNazemAccounts|notifyNazemFailure|notifyNazemRecovered/);
  }

  await Promise.all([
    assert.rejects(access(new URL('../server/services/appNotifications.js', import.meta.url))),
    access(new URL('../server/routes/notificationRoutes.js', import.meta.url)),
    assert.rejects(access(new URL('../server/integrations/nazem', import.meta.url))),
    assert.rejects(access(new URL('../server/workers/nazemSyncWorker.js', import.meta.url))),
    assert.rejects(access(new URL('../src/components/notifications/NotificationsSection.jsx', import.meta.url))),
    assert.rejects(access(new URL('../src/hooks/useAppNotificationPolling.js', import.meta.url))),
  ]);
});
