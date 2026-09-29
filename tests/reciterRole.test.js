import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reciters are removed: no management page, permission, API or sign in', async () => {
  const [authRoutes, server, serverPermissions, clientPermissions, dashboard, userSections, routes, api, login] = await Promise.all([
    read('../server/routes/tenantAuthRoutes.js'),
    read('../server/index.js'),
    read('../server/services/dashboardPermissions.js'),
    read('../src/lib/dashboardPermissions.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/userSections.js'),
    read('../src/lib/sectionRoutes.js'),
    read('../src/services/studentsApi.js'),
    read('../src/pages/LoginGateway.jsx'),
  ]);
  assert.match(authRoutes, /WHERE login_number = \? AND is_active = 1 AND role <> 'reciter'/);
  assert.doesNotMatch(authRoutes, /createLoginPayload\(req, res, 'reciter'/);
  assert.match(server, /if \(req\.auth\?\.role === 'reciter'\) return res\.status\(401\)/);
  assert.doesNotMatch(server, /app\.(?:get|post|put|patch)\('\/api\/reciters/);
  assert.doesNotMatch(serverPermissions + clientPermissions, /'reciters'/);
  assert.doesNotMatch(dashboard + userSections + routes + api + login, /reciter|Reciter|المقرئ/);
  await assert.rejects(access(new URL('../src/components/dashboard/RecitersSection.jsx', import.meta.url)));
});
