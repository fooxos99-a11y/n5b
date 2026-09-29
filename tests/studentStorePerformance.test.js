import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('opening the student store does not prepare Quran or the complete offline workspace', async () => {
  const [view, service] = await Promise.all([
    readFile(new URL('../src/components/portal/StudentStoreSection.jsx', import.meta.url),'utf8'),
    readFile(new URL('../src/services/offlineStudentService.js', import.meta.url),'utf8'),
  ]);
  assert.match(view,/await loadOfflineStudentStore\(studentId\)/);
  assert.doesNotMatch(view,/loadOfflineStudentWorkspace|prepareOfflineStudentWorkspace/);
  const loader = service.slice(service.indexOf('const fetchStudentStore'),service.indexOf('export async function prepareOfflineStudentWorkspace'));
  assert.match(loader,/studentsApi.getStoreProducts\(\)/);
  assert.doesNotMatch(loader,/bootstrapOfflineStudent|getStudentQuran|loadStudentPlan|setMeta/);
  assert.match(loader,/workspace\?\.store\?\.pendingSync/);
  assert.match(loader,/sessionVersion !== getAuthSessionVersion\(\)/);
  assert.match(view,/if \(loadError\) return <ErrorState/);
});
