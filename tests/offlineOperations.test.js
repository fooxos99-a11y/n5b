import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  distanceInMeters,
  isStaffAttendanceLocationConfigured,
} from '../shared/staff-attendance.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('all safe teacher operations use one durable offline queue', async () => {
  const [operations, store, attendance, narration, plans] = await Promise.all([
    read('../src/services/offlineOperationsService.js'),
    read('../src/services/offlineRecitationStore.js'),
    read('../src/hooks/useStaffAttendance.js'),
    read('../src/components/dashboard/NarrationDaySection.jsx'),
    read('../src/components/dashboard/StudentPlansSection.jsx'),
  ]);
  for (const type of ['student_attendance', 'staff_attendance', 'narration_part', 'narration_juz', 'narration_student_status']) {
    assert.match(operations, new RegExp(type));
  }
  assert.match(store, /dedupeKey/);
  assert.match(store, /requestId: existing\.actionId/);
  assert.match(attendance, /commitOfflineOperation/);
  assert.match(attendance, /navigator\.onLine !== false[\s\S]*checkInMyStaffAttendance\(coordinates\)/);
  assert.match(attendance, /pending_sync/);
  assert.match(narration, /narration_juz/);
  assert.match(plans, /loadOfflineSnapshot/);
});

test('offline staff attendance verifies the cached location and trusted device time', async () => {
  const [router, service] = await Promise.all([
    read('../server/routes/staffAttendanceRoutes.js'),
    read('../server/services/offlineRecitation.js'),
  ]);
  assert.ok(distanceInMeters({ lat: 26.3592, lng: 43.9818 }, { lat: 26.3592, lng: 43.9818 }) < 1);
  assert.ok(distanceInMeters({ lat: 26.3592, lng: 43.9818 }, { lat: 26.3602, lng: 43.9818 }) > 100);
  assert.equal(isStaffAttendanceLocationConfigured(null, null), false);
  assert.equal(isStaffAttendanceLocationConfigured('', ''), false);
  assert.equal(isStaffAttendanceLocationConfigured(26.3592, 43.9818), true);
  assert.match(router, /offlinePolicy/);
  assert.match(router, /if \(locationRequired\)/);
  assert.doesNotMatch(router, /موقع التحضير غير محدد/);
  assert.match(router, /resolveTrustedDeviceEventTime/);
  assert.match(router, /UNTRUSTED_OFFLINE_TIME/);
  assert.match(service, /actorRole === actorRole/);
});

test('staff check-in requests location only when a location is configured', async () => {
  const [attendance, server] = await Promise.all([
    read('../src/hooks/useStaffAttendance.js'),
    read('../server/index.js'),
  ]);
  assert.match(attendance, /const coordinates = locationRequired \? await getCoordinates\(\) : \{\}/);
  assert.match(attendance, /checkInMyStaffAttendance\(coordinates\)/);
  assert.match(server, /staffAttendanceLocationLat: settings\.staffAttendanceLocationUrl && settings\.staffAttendanceLocationLat/);
  assert.match(server, /else if \(!settings\.staffAttendanceLocationUrl\)[\s\S]{0,180}staffAttendanceLocationLat = null/);
});

test('web background sync uploads actions and recitation sessions without an open page', async () => {
  const [worker, main, bridge] = await Promise.all([
    read('../public/sw.js'),
    read('../src/main.jsx'),
    read('../src/components/native/OfflineRecitationSyncBridge.jsx'),
  ]);
  assert.match(worker, /nukhab-offline-operations/);
  assert.match(worker, /syncStoredActions/);
  assert.match(worker, /syncStoredSessions/);
  assert.match(worker, /offline-recitation\/batch/);
  assert.doesNotMatch(main, /keys\.filter\(\(key\) => key\.includes\('-pwa-'\)\)/);
  assert.match(worker, /\.slice\(0, 3\)/);
  assert.match(main, /sw\.js\?brand=/);
  assert.match(bridge, /NUKHAB_SYNC_OFFLINE_OPERATIONS/);
});

test('teacher recitation workspace prepares automatically without a visible setup card', async () => {
  const [service, store, bridge, evaluation] = await Promise.all([
    read('../src/services/offlineRecitationService.js'),
    read('../src/services/offlineRecitationStore.js'),
    read('../src/components/native/OfflineRecitationSyncBridge.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
  ]);
  assert.match(service, /prepareOfflineRecitationWorkspace/);
  assert.match(service, /activeWorkspacePreparations/);
  assert.match(service, /prefetchRecitationTasks/);
  assert.match(service, /prefetchOfflineWorkspace/);
  assert.match(store, /offline_prepared_at/);
  assert.match(bridge, /prepareOfflineRecitationWorkspace/);
  assert.doesNotMatch(evaluation, /OfflineWorkspaceCard/);
});

test('teacher Mushaf opens from the prepared cache without waiting for unrelated fonts or a range refresh', async () => {
  const [service, dialog, evaluation, fonts] = await Promise.all([
    read('../src/services/offlineRecitationService.js'),
    read('../src/components/portal/MushafRecitationDialog.jsx'),
    read('../src/components/portal/TeacherEvaluationDialog.jsx'),
    read('../src/lib/quranFonts.js'),
  ]);
  assert.match(service, /preferCache/);
  assert.match(service, /Promise\.allSettled\(uniqueTasks\.map/);
  assert.match(evaluation, /selectedEndMatchesTasks/);
  assert.match(evaluation, /preferCache: true/);
  assert.match(dialog, /setEntries\(nextEntries\)[\s\S]+setIsLoading\(false\)[\s\S]+void preloadMushafFonts/);
  assert.doesNotMatch(fonts, /document\.fonts\?\.ready/);
});
