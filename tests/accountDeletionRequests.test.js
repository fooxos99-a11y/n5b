import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('manager settings expose pending account deletion requests with delete and cancel actions', async () => {
  const [dialog, settings, dashboard, routes] = await Promise.all([
    readFile(new URL('../src/components/dashboard/AccountDeletionRequestsDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/accountDeletionRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(settings, /title="إنهاء الفصل وطلبات الحذف"[\s\S]*canManageDeletionRequests[\s\S]*<AccountPolicyLinks>[\s\S]*settings\.deletionRequestsSectionEnabled !== false[\s\S]*<AccountDeletionRequestsDialog triggerClassName="w-auto px-3 text-xs sm:text-sm" \/>[\s\S]*<\/AccountPolicyLinks>[\s\S]*إنهاء الفصل والبدء بفصل جديد/);
  assert.match(dashboard, /canManageDeletionRequests=\{isManager \|\| \(\(isAdmin \|\| isSupervisor\) && dashboardPermissions\.includes\('settings'\)\)\}/);
  assert.match(dialog, />\s*طلبات الحذف\s*</);
  assert.match(dialog, /status === 'pending'/);
  assert.match(dialog, /updateRequest\(request, 'completed'\)/);
  assert.match(dialog, /updateRequest\(request, 'rejected'\)/);
  assert.match(dialog, /size="icon"/);
  assert.match(dialog, /cn\('min-h-11 w-full justify-center gap-2', triggerClassName\)/);
  assert.match(dialog, /\[font-family:var\(--font-ui\)\]/);
  assert.match(routes, /DELETE FROM students WHERE id = \?/);
  assert.match(routes, /DELETE FROM supervisors WHERE id = \?/);
  assert.match(routes, /DELETE FROM auth_sessions WHERE user_role = \? AND user_id = \?/);
  assert.match(routes, /connection\.beginTransaction\(\)/);
  assert.match(routes, /connection\.commit\(\)/);
});
