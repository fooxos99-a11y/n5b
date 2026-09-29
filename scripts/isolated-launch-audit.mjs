import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import {
  getWhatsAppTenantAuthPath,
  getWhatsAppTenantKey,
} from '../server/services/whatsAppTenant.js';

const projectRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const databaseNames = {
  primary: 'wajeh_launch_audit_primary',
  secondary: 'wajeh_launch_audit_secondary',
  platform: 'wajeh_launch_audit_platform',
  provisioned: 'wajeh_tenant_2020',
};
const setupToken = 'isolated-launch-audit-token';
const children = [];
const localServers = [];
const checks = [];

const ensureAuditDatabaseName = (name) => {
  if (!Object.values(databaseNames).includes(name)) {
    throw new Error(`Unsafe audit database name: ${name}`);
  }
  return name;
};

async function resetAuditDatabases() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  try {
    for (const name of Object.values(databaseNames)) {
      await connection.query(`DROP DATABASE IF EXISTS \`${ensureAuditDatabaseName(name)}\``);
    }
  } finally {
    await connection.end();
  }
}

function startApi({ port, instanceKey, registrationNumber, managerLogin, database }) {
  const output = [];
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      API_PORT: String(port),
      SITE_REGISTRATION_NUMBER: String(registrationNumber),
      MANAGER_LOGIN_NUMBER: String(managerLogin),
      MANAGER_NAME: `مدير تدقيق ${instanceKey}`,
      MYSQL_DATABASE: database,
      PLATFORM_MYSQL_DATABASE: databaseNames.platform,
      PLATFORM_SETUP_TOKEN: setupToken,
      PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
      PUBLIC_API_URL: `http://127.0.0.1:${port}/api`,
      WHATSAPP_AUTH_PATH: nodePath.join(projectRoot, '.audit-whatsapp', instanceKey),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const collect = (chunk) => {
    output.push(String(chunk));
    if (output.length > 80) output.shift();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  children.push(child);
  return { child, output, baseUrl: `http://127.0.0.1:${port}/api` };
}

async function stopApi(server) {
  if (server?.child.exitCode !== null) return;
  await new Promise((resolve) => {
    server.child.once('exit', resolve);
    server.child.kill();
    setTimeout(resolve, 3000);
  });
}

async function waitForHealth(server, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (server.child.exitCode !== null) {
      throw new Error(`API exited early:\n${server.output.join('')}`);
    }
    try {
      const response = await fetch(`${server.baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The isolated API is still starting and creating its schema.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API health timeout:\n${server.output.join('')}`);
}

async function api(baseUrl, path, {
  token,
  registrationNumber,
  method = 'GET',
  body,
  expected = 200,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(registrationNumber ? { 'X-Registration-Number': String(registrationNumber) } : {}),
      'X-Nukhab-Native': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function apiFile(baseUrl, path, { token, expected = 200, contentType } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal(response.status, expected, `GET ${path}: expected ${expected}, received ${response.status}`);
  if (contentType) assert.match(response.headers.get('content-type') || '', contentType);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 100, `GET ${path}: exported file is unexpectedly small`);
  return bytes;
}

function getSaudiToday() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function checked(label, assertion) {
  assertion();
  checks.push(label);
}

async function login(baseUrl, registrationNumber, loginNumber) {
  return api(baseUrl, '/auth/login', {
    method: 'POST',
    body: { registrationNumber: String(registrationNumber), loginNumber: String(loginNumber) },
  });
}

async function run() {
  await resetAuditDatabases();

  let primary = startApi({
    port: 3311,
    instanceKey: 'primary',
    registrationNumber: 101,
    managerLogin: 1483,
    database: databaseNames.primary,
  });
  await waitForHealth(primary);
  const secondary = startApi({
    port: 3312,
    instanceKey: 'secondary',
    registrationNumber: 1000,
    managerLogin: 2483,
    database: databaseNames.secondary,
  });
  await waitForHealth(secondary);

  const securityResponse = await fetch(`${primary.baseUrl}/health`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  const nativeCorsResponse = await fetch(`${primary.baseUrl}/health`, {
    headers: { Origin: 'capacitor://localhost' },
  });
  checked('security headers, CORS, and unauthenticated access are enforced', () => {
    assert.equal(securityResponse.status, 200);
    assert.equal(securityResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(securityResponse.headers.get('x-frame-options'), 'DENY');
    assert.equal(securityResponse.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(securityResponse.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(securityResponse.headers.get('permissions-policy') || '', /microphone=\(self\)/);
    assert.equal(securityResponse.headers.get('access-control-allow-origin'), null);
    assert.equal(nativeCorsResponse.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal(nativeCorsResponse.headers.get('access-control-allow-credentials'), 'true');
  });
  await api(primary.baseUrl, '/notifications/me', { expected: 401 });

  const platformStatus = await api(primary.baseUrl, '/platform/status');
  checked('platform owner starts unconfigured', () => assert.equal(platformStatus.ownerConfigured, false));
  await api(primary.baseUrl, '/platform/setup', {
    method: 'POST',
    expected: 403,
    body: { setupToken: 'wrong', displayName: 'مالك نخب', username: '14831483', password: '14831483' },
  });
  await api(primary.baseUrl, '/platform/setup', {
    method: 'POST',
    expected: 201,
    body: { setupToken, displayName: 'مالك نخب', username: '14831483', password: '14831483' },
  });
  await api(primary.baseUrl, '/platform/setup', {
    method: 'POST',
    expected: 409,
    body: { setupToken, displayName: 'مالك آخر', username: 'other-owner', password: 'different-password' },
  });
  await api(primary.baseUrl, '/platform/login', {
    method: 'POST',
    expected: 404,
    body: { registrationNumber: '14831483', loginNumber: 'wrong-password' },
  });
  const ownerLogin = await api(primary.baseUrl, '/platform/login', {
    method: 'POST',
    body: { registrationNumber: '14831483', loginNumber: '14831483' },
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await api(primary.baseUrl, '/platform/login', {
      method: 'POST',
      expected: 404,
      body: { registrationNumber: '14831483', loginNumber: 'wrong-password' },
    });
  }
  await api(primary.baseUrl, '/platform/login', {
    method: 'POST',
    expected: 429,
    body: { registrationNumber: '14831483', loginNumber: 'wrong-password' },
  });
  checked('platform owner login attempts are rate limited in the database', () => assert.ok(true));
  const complexes = await api(primary.baseUrl, '/platform/complexes', { token: ownerLogin.token });
  checked('both isolated complexes registered centrally', () => {
    assert.deepEqual(
      complexes.map((complex) => complex.registrationNumber).sort((a, b) => a.localeCompare(b)),
      ['1000', '101'].sort((a, b) => a.localeCompare(b)),
    );
  });
  const provisionedComplex = await api(primary.baseUrl, '/platform/complexes', {
    token: ownerLogin.token,
    method: 'POST',
    expected: 201,
    body: {
      registrationNumber: '2020',
      name: 'مجمع التجهيز الآلي',
      managerName: 'مدير المجمع الجديد',
      managerLoginNumber: '92020',
      contactName: 'مسؤول التجربة',
      contactPhone: '0500000000',
    },
  });
  checked('new complex is fully provisioned and activated', () => {
    assert.equal(provisionedComplex.status, 'active');
    assert.equal(provisionedComplex.registrationNumber, '2020');
    assert.equal(provisionedComplex.managerLoginNumber, '92020');
    assert.equal(provisionedComplex.whatsappUrl, 'https://wa.me/966500000000');
  });
  const provisionedSiteConfig = await api(primary.baseUrl, '/site-config', {
    registrationNumber: 2020,
  });
  const primarySiteConfig = await api(primary.baseUrl, '/site-config', {
    registrationNumber: 101,
  });
  checked('each complex exposes only its own WhatsApp support number', () => {
    assert.equal(provisionedSiteConfig.whatsappUrl, 'https://wa.me/966500000000');
    assert.notEqual(provisionedSiteConfig.whatsappUrl, primarySiteConfig.whatsappUrl);
  });
  checked('each complex has an isolated WhatsApp barcode session and auth folder', () => {
    const basePath = nodePath.join(projectRoot, '.audit-whatsapp', 'nukhab');
    const defaultDatabase = databaseNames.primary;
    const primaryAuthPath = getWhatsAppTenantAuthPath({
      basePath,
      databaseName: databaseNames.primary,
      defaultDatabase,
    });
    const provisionedAuthPath = getWhatsAppTenantAuthPath({
      basePath,
      databaseName: provisionedComplex.databaseName,
      defaultDatabase,
    });
    assert.notEqual(getWhatsAppTenantKey(databaseNames.primary), getWhatsAppTenantKey(provisionedComplex.databaseName));
    assert.notEqual(primaryAuthPath, provisionedAuthPath);
  });
  const provisionedManager = await login(primary.baseUrl, 2020, 92020);
  const provisionedRecipients = await api(primary.baseUrl, '/notifications/recipients', {
    token: provisionedManager.token,
    registrationNumber: 2020,
  });
  const [provisionedCommittees, provisionedStudents, provisionedSettings] = await Promise.all([
    api(primary.baseUrl, '/committees', {
      token: provisionedManager.token,
      registrationNumber: 2020,
    }),
    api(primary.baseUrl, '/students?committeeId=all', {
      token: provisionedManager.token,
      registrationNumber: 2020,
    }),
    api(primary.baseUrl, '/settings', {
      token: provisionedManager.token,
      registrationNumber: 2020,
    }),
  ]);
  checked('provisioned complex manager can enter its isolated database immediately', () => {
    assert.equal(provisionedManager.role, 'manager');
    assert.equal(provisionedRecipients.length, 1);
    assert.equal(provisionedRecipients[0].name, 'مدير المجمع الجديد');
  });
  checked('newly provisioned complex starts empty with the requested automatic settings', () => {
    assert.equal(provisionedCommittees.length, 0);
    assert.equal(provisionedStudents.length, 0);
    assert.deepEqual(provisionedSettings.weeklyHolidayDays, [5, 6]);
    assert.deepEqual(provisionedSettings.holidayTaskTypes, []);
    assert.deepEqual(provisionedSettings.recitationSessionDays, [0, 1, 2, 3, 4]);
  });
  const provisionedNotification = await api(primary.baseUrl, '/notifications', {
    token: provisionedManager.token,
    registrationNumber: 2020,
    method: 'POST',
    expected: 201,
    body: {
      title: 'إشعار المجمع الجديد',
      body: 'هذا الإشعار لا يغادر قاعدة المجمع الجديد.',
      recipientType: 'all',
    },
  });
  const provisionedInbox = await api(primary.baseUrl, '/notifications/me', {
    token: provisionedManager.token,
    registrationNumber: 2020,
  });
  await api(primary.baseUrl, '/notifications/me', {
    token: provisionedManager.token,
    expected: 401,
  });
  checked('provisioned complex notifications and sessions require its tenant context', () => {
    assert.equal(provisionedNotification.recipientsCount, 1);
    assert.equal(provisionedInbox[0].title, 'إشعار المجمع الجديد');
  });

  const primaryManager = await login(primary.baseUrl, 101, 1483);
  const secondaryManager = await login(secondary.baseUrl, 1000, 2483);
  checked('tenant managers are isolated', () => {
    assert.equal(primaryManager.role, 'manager');
    assert.equal(secondaryManager.role, 'manager');
    assert.notEqual(primaryManager.token, secondaryManager.token);
  });
  await api(secondary.baseUrl, '/students', { token: primaryManager.token, expected: 401 });
  await api(primary.baseUrl, '/students', {
    token: primaryManager.token,
    registrationNumber: 2020,
    expected: 401,
  });
  checked('a valid session from one tenant is rejected by another tenant', () => assert.ok(true));

  const primaryFamily = await api(primary.baseUrl, '/families', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: { name: 'حلقة تدقيق المجمع الأول' },
  });
  const secondaryFamily = await api(secondary.baseUrl, '/families', {
    token: secondaryManager.token,
    method: 'POST',
    expected: 201,
    body: { name: 'حلقة تدقيق المجمع الثاني' },
  });
  const primaryStudent = await api(primary.baseUrl, '/students', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: {
      name: 'طالب تدقيق المجمع الأول',
      loginNumber: '9001',
      nationalId: '1000000001',
      guardianPhone: '0500000001',
      committeeId: primaryFamily.id,
    },
  });
  const secondaryStudent = await api(secondary.baseUrl, '/students', {
    token: secondaryManager.token,
    method: 'POST',
    expected: 201,
    body: {
      name: 'طالب تدقيق المجمع الثاني',
      loginNumber: '9001',
      nationalId: '1000000002',
      guardianPhone: '0500000002',
      committeeId: secondaryFamily.id,
    },
  });
  checked('same login number can exist in separate complexes', () => {
    assert.equal(primaryStudent.loginNumber, secondaryStudent.loginNumber);
  });

  const primarySupervisor = await api(primary.baseUrl, '/supervisors', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: {
      name: 'معلم إشعارات',
      loginNumber: '9002',
      nationalId: '1000000003',
      phone: '0500000003',
      committeeIds: [primaryFamily.id],
    },
  });
  await api(primary.baseUrl, `/dashboard-permissions/${primarySupervisor.id}`, {
    token: primaryManager.token,
    method: 'PUT',
    body: { permissions: ['notifications'] },
  });
  await api(primary.baseUrl, '/administrators', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: {
      name: 'إداري إشعارات',
      loginNumber: '9003',
      nationalId: '1000000004',
      phone: '0500000004',
      jobTitle: 'إداري',
      permissions: ['notifications'],
    },
  });

  const studentA = await login(primary.baseUrl, 101, 9001);
  const studentB = await login(secondary.baseUrl, 1000, 9001);
  const supervisorA = await login(primary.baseUrl, 101, 9002);
  const adminA = await login(primary.baseUrl, 101, 9003);
  checked('notification permission is returned to staff', () => {
    assert.deepEqual(supervisorA.dashboardPermissions, ['notifications']);
    assert.deepEqual(adminA.dashboardPermissions, ['notifications']);
  });

  const siteConfig = await api(primary.baseUrl, '/site-config');
  const homepageStats = await api(primary.baseUrl, '/homepage-stats');
  const committees = await api(primary.baseUrl, '/committees');
  checked('public application endpoints return the current tenant only', () => {
    assert.equal(siteConfig.registrationNumber, '101');
    assert.ok(Array.isArray(homepageStats));
    assert.ok(committees.some((committee) => Number(committee.id) === Number(primaryFamily.id)));
  });

  await api(primary.baseUrl, '/students', {
    token: primaryManager.token,
    method: 'POST',
    expected: 409,
    body: {
      name: 'رقم مكرر',
      loginNumber: '9002',
      nationalId: '1000000010',
      guardianPhone: '0500000010',
      committeeId: primaryFamily.id,
    },
  });
  await api(primary.baseUrl, `/students/${primaryStudent.id}`, { token: studentA.token });
  await api(primary.baseUrl, `/students/${secondaryStudent.id + 1000}`, { token: studentA.token, expected: 403 });
  await api(primary.baseUrl, '/families', { token: studentA.token, expected: 403 });
  checked('duplicate logins and cross-account student reads are blocked', () => assert.ok(true));
  await api(primary.baseUrl, '/students', {
    token: primaryManager.token,
    method: 'POST',
    expected: 422,
    body: {
      name: 'طالب ببيانات غير صالحة',
      loginNumber: 'not-numeric',
      nationalId: '1234567890',
      guardianPhone: '0500000011',
      committeeId: primaryFamily.id,
    },
  });
  await api(primary.baseUrl, '/students/999999/committee', {
    token: primaryManager.token,
    method: 'PATCH',
    expected: 404,
    body: { committeeId: primaryFamily.id },
  });
  await api(primary.baseUrl, `/students/${primaryStudent.id}/committee`, {
    token: primaryManager.token,
    method: 'PATCH',
    expected: 422,
    body: { committeeId: 999999 },
  });
  checked('account inputs and missing committee targets are rejected cleanly', () => assert.ok(true));
  await api(primary.baseUrl, '/whatsapp/send', {
    token: primaryManager.token,
    method: 'POST',
    expected: 422,
    body: {
      recipientType: 'students',
      studentIds: [primaryStudent.id],
      message: 'اختبار نوع المرفق',
      attachment: {
        name: 'unsafe.exe',
        type: 'application/x-msdownload',
        data: 'dGVzdA==',
      },
    },
  });
  await api(primary.baseUrl, '/whatsapp/send', {
    token: primaryManager.token,
    method: 'POST',
    expected: 422,
    body: {
      recipientType: 'students',
      studentIds: [primaryStudent.id],
      message: 'اختبار بيانات المرفق',
      attachment: {
        name: 'test.pdf',
        type: 'application/pdf',
        data: 'not-valid-base64!',
      },
    },
  });
  checked('unsafe WhatsApp attachment types and malformed data are rejected', () => assert.ok(true));

  const secondFamily = await api(primary.baseUrl, '/families', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: { name: 'حلقة النقل المؤقت' },
  });
  await api(primary.baseUrl, `/students/${primaryStudent.id}/committee`, {
    token: primaryManager.token,
    method: 'PATCH',
    body: { committeeId: secondFamily.id },
  });
  let movedStudent = await api(primary.baseUrl, `/students/${primaryStudent.id}`, { token: primaryManager.token });
  checked('student transfer persists', () => assert.equal(Number(movedStudent.committeeId), Number(secondFamily.id)));
  await api(primary.baseUrl, `/students/${primaryStudent.id}/committee`, {
    token: primaryManager.token,
    method: 'PATCH',
    body: { committeeId: primaryFamily.id },
  });
  await api(primary.baseUrl, `/families/${secondFamily.id}`, {
    token: primaryManager.token,
    method: 'DELETE',
  });

  const settings = await api(primary.baseUrl, '/settings', { token: primaryManager.token });
  let ssrfHits = 0;
  const ssrfTrap = createServer((_req, res) => {
    ssrfHits += 1;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('private service');
  });
  await new Promise((resolve, reject) => {
    ssrfTrap.once('error', reject);
    ssrfTrap.listen(3320, '127.0.0.1', resolve);
  });
  localServers.push(ssrfTrap);
  const ssrfSettings = await api(primary.baseUrl, '/settings', {
    token: primaryManager.token,
    method: 'PUT',
    body: {
      ...settings,
      attendanceLocationUrl: 'http://127.0.0.1:3320/private',
    },
  });
  checked('attendance map resolution blocks non-Google and private URLs', () => {
    assert.equal(ssrfHits, 0);
    assert.equal(ssrfSettings.attendanceLocationLat, null);
    assert.equal(ssrfSettings.attendanceLocationLng, null);
  });
  await new Promise((resolve) => ssrfTrap.close(resolve));
  localServers.splice(localServers.indexOf(ssrfTrap), 1);

  const today = getSaudiToday();
  const todayWeekDay = new Date(`${today}T00:00:00Z`).getUTCDay();
  const nonTodayHoliday = todayWeekDay === 6 ? 5 : 6;
  const updatedSettings = await api(primary.baseUrl, '/settings', {
    token: primaryManager.token,
    method: 'PUT',
    body: {
      ...ssrfSettings,
      attendanceLocationUrl: '',
      weeklyHolidayDays: [nonTodayHoliday],
      recitationSessionDays: [todayWeekDay],
      attendanceManualEnabled: true,
      quranTaskExecutionSource: 'student',
      recitationAttendanceSource: 'teacher',
    },
  });
  checked('settings round-trip and recitation modes persist', () => {
    assert.deepEqual(updatedSettings.recitationSessionDays, [todayWeekDay]);
    assert.equal(updatedSettings.quranTaskExecutionSource, 'student');
    assert.equal(updatedSettings.recitationAttendanceSource, 'teacher');
    assert.equal(updatedSettings.pointsSystemEnabled, true);
  });

  const chapters = await api(primary.baseUrl, '/quran/chapters', { token: primaryManager.token });
  const firstSurahAyahs = await api(primary.baseUrl, '/quran/ayahs?surah=1', { token: primaryManager.token });
  const juzRanges = await api(primary.baseUrl, '/quran/juz-ranges', { token: primaryManager.token });
  checked('Quran reference data is complete', () => {
    assert.equal(chapters.length, 114);
    assert.equal(firstSurahAyahs.length, 7);
    assert.equal(juzRanges.length, 30);
  });

  await api(primary.baseUrl, `/student-plans/${primaryStudent.id}`, {
    token: primaryManager.token,
    method: 'PUT',
    body: {
      track: 'memorization',
      startPage: 1,
      endPage: 3,
      dailyPages: 0.5,
      reviewPages: 10,
      linkPages: 10,
      priorMemorization: [{ startPage: 10, endPage: 11 }],
      reviewSplitWeekly: false,
    },
  });
  const initialPlanRows = await api(primary.baseUrl, '/student-plans?committeeId=all', { token: primaryManager.token });
  checked('student plan is created with prior memorization', () => {
    const row = initialPlanRows.find((item) => Number(item.studentId) === Number(primaryStudent.id));
    assert.equal(Number(row.plan.startPage), 1);
    assert.equal(Number(row.plan.endPage), 3);
    assert.deepEqual(
      row.plan.priorMemorization.map(({ startPage, endPage }) => [Number(startPage), Number(endPage)]),
      [[10, 11]]
    );
  });

  await api(primary.baseUrl, `/student-plans/${primaryStudent.id}`, {
    token: primaryManager.token,
    method: 'PUT',
    body: {
      track: 'memorization',
      startPage: 1,
      endPage: 3,
      dailyPages: 0.5,
      reviewPages: 10,
      linkPages: 10,
      priorMemorization: [],
      reviewSplitWeekly: false,
    },
  });
  const editedPlanRows = await api(primary.baseUrl, '/student-plans?committeeId=all', { token: primaryManager.token });
  const savedQuran = await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-saved`, { token: studentA.token });
  checked('editing a plan keeps prior memorization and counts it as saved', () => {
    const row = editedPlanRows.find((item) => Number(item.studentId) === Number(primaryStudent.id));
    assert.deepEqual(
      row.plan.priorMemorization.map(({ startPage, endPage }) => [Number(startPage), Number(endPage)]),
      [[10, 11]]
    );
    assert.ok(savedQuran.reduce((total, juz) => total + Number(juz.memorizedPages || 0), 0) >= 2);
  });

  const todayTasks = await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-today`, { token: studentA.token });
  const memorizationTaskIds = todayTasks.tasks
    .filter((task) => task.taskType === 'memorization')
    .map((task) => Number(task.id));
  checked('daily plan tasks are generated on a configured work day', () => assert.ok(memorizationTaskIds.length > 0));
  await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-tasks/execution`, {
    token: primaryManager.token,
    method: 'POST',
    expected: 403,
    body: { taskIds: memorizationTaskIds, status: 'done' },
  });
  await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-tasks/execution`, {
    token: studentA.token,
    method: 'POST',
    body: { taskIds: memorizationTaskIds, status: 'done' },
  });

  await api(primary.baseUrl, `/students/${primaryStudent.id}/attendance`, {
    token: primaryManager.token,
    method: 'POST',
    body: { mode: 'manual', date: today, status: 'present' },
  });
  const teacherEvaluation = await api(
    primary.baseUrl,
    `/supervisors/${primarySupervisor.id}/quran-evaluation?date=${today}`,
    { token: supervisorA.token },
  );
  const taskToEvaluate = teacherEvaluation.tasks.find((task) => task.taskType === 'memorization');
  checked('teacher session sees only its committee and executed task', () => {
    assert.ok(teacherEvaluation.students.some((student) => Number(student.studentId) === Number(primaryStudent.id)));
    assert.ok(taskToEvaluate);
  });
  const halfFaceEvaluation = await api(primary.baseUrl, `/supervisors/${primarySupervisor.id}/quran-evaluation/${taskToEvaluate.id}`, {
    token: supervisorA.token,
    method: 'POST',
    body: { date: today, warningCount: 1, mistakeCount: 0 },
  });
  const sessions = await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-sessions`, { token: studentA.token });
  const records = await api(primary.baseUrl, `/students/${primaryStudent.id}/records`, { token: studentA.token });
  checked('teacher evaluation and attendance are saved', () => {
    assert.ok(sessions.length > 0);
    assert.ok(records.records.some((record) => record.date === today && record.status === 'present'));
    assert.equal(Number(halfFaceEvaluation.evaluatedFaces), 0.5);
    assert.equal(Number(halfFaceEvaluation.evaluationMaxScore), 100);
    assert.equal(Number(halfFaceEvaluation.evaluationScore), 99);
  });

  await api(primary.baseUrl, `/students/${primaryStudent.id}/points/award`, {
    token: primaryManager.token,
    method: 'POST',
    body: { points: 5, reason: 'اختبار النقاط', type: 'increase' },
  });
  const studentPoints = await api(primary.baseUrl, `/students/${primaryStudent.id}/points`, { token: studentA.token });
  const studentRankings = await api(primary.baseUrl, '/rankings/students?committeeId=all');
  const familyRankings = await api(primary.baseUrl, '/rankings/families');
  checked('points ledger and rankings stay consistent', () => {
    assert.ok(studentPoints.transactions.some((transaction) => transaction.reason === 'اختبار النقاط'));
    assert.ok(studentRankings.some((student) => Number(student.id) === Number(primaryStudent.id)));
    assert.ok(familyRankings.some((family) => Number(family.id) === Number(primaryFamily.id)));
  });

  const reportPaths = [
    `/reports/students?date=${today}&committeeId=all`,
    `/reports/supervisors?date=${today}`,
    `/reports/overview?date=${today}`,
    `/reports/progress?from=${today}&to=${today}&committeeId=all`,
    `/reports/recitation-sessions?from=${today}&to=${today}&committeeId=all`,
    `/reports/student-saved?from=${today}&to=${today}&committeeId=all&studentId=all`,
    `/reports/points?date=${today}&type=students`,
    `/execution-followup?from=${today}&to=${today}&committeeId=all&taskType=all&status=all`,
  ];
  let progressReport;
  for (const reportPath of reportPaths) {
    const report = await api(primary.baseUrl, reportPath, { token: primaryManager.token });
    if (reportPath.startsWith('/reports/progress?')) progressReport = report;
  }
  checked('unified student report includes attendance, saved ranges, and daily details', () => {
    const studentRow = progressReport.rows.find((row) => Number(row.id) === Number(primaryStudent.id));
    assert.equal(progressReport.period.mode, 'daily');
    assert.equal(progressReport.period.studentId, 'all');
    assert.ok(studentRow);
    assert.equal(typeof studentRow.saved.memorization, 'string');
    assert.ok(Array.isArray(studentRow.dailyDetails));
    assert.ok(studentRow.dailyDetails.some((detail) => detail.date === today));
    assert.ok(studentRow.dailyDetails.every((detail) => ['no_plan', 'not_completed', 'partial', 'completed'].includes(detail.memorizationStatus)));
  });
  await apiFile(primary.baseUrl, `/reports/overview/export?from=${today}&to=${today}&format=pdf`, {
    token: primaryManager.token,
    contentType: /application\/pdf/,
  });
  checked('all report families and PDF export respond successfully', () => assert.ok(true));

  const callRooms = await api(primary.baseUrl, '/calls', { token: primaryManager.token });
  checked('calls page reports its infrastructure readiness', () => assert.equal(callRooms.livekitConfigured, false));
  await api(primary.baseUrl, '/calls', {
    token: primaryManager.token,
    method: 'POST',
    expected: 503,
    body: { name: 'غرفة تدقيق', committeeId: primaryFamily.id },
  });

  const narration = await api(primary.baseUrl, '/narration-events', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: { name: 'يوم سرد تدقيق', startDate: today, endDate: today, scope: 'all' },
  });
  await api(primary.baseUrl, `/narration-events/${narration.id}`, { token: primaryManager.token });
  await api(primary.baseUrl, `/narration-events/${narration.id}/archive`, {
    token: primaryManager.token,
    method: 'POST',
    body: {},
  });
  await api(primary.baseUrl, `/narration-events/${narration.id}`, {
    token: primaryManager.token,
    method: 'DELETE',
  });
  checked('narration day create, archive, and delete workflow succeeds', () => assert.ok(true));

  await api(primary.baseUrl, '/registration-requests/config', {
    token: primaryManager.token,
    method: 'PUT',
    body: { registrationEnabled: true },
  });
  const publicRegistration = await api(primary.baseUrl, '/registration/public');
  checked('public registration can be opened per tenant', () => assert.equal(publicRegistration.enabled, true));
  const registrationRequest = await api(primary.baseUrl, '/registration/public', {
    method: 'POST',
    expected: 201,
    body: {
      name: 'طالب طلب التسجيل',
      guardianPhone: '0500000099',
      nationalId: '1234567899',
      age: 12,
      memorization: { fullJuzs: [] },
    },
  });
  const registrationRows = await api(primary.baseUrl, '/registration-requests', { token: primaryManager.token });
  checked('registration request stays inside the current tenant', () => {
    assert.ok(registrationRows.requests.some((request) => Number(request.id) === Number(registrationRequest.id)));
  });
  const acceptedRegistration = await api(primary.baseUrl, `/registration-requests/${registrationRequest.id}/accept`, {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: {
      name: 'طالب طلب التسجيل',
      loginNumber: '9004',
      guardianPhone: '0500000099',
      nationalId: '1234567899',
      age: 12,
      committeeId: primaryFamily.id,
      testResults: {},
    },
  });
  const acceptedLogin = await login(primary.baseUrl, 101, 9004);
  checked('accepted registration creates a usable local student account', () => {
    assert.equal(acceptedLogin.role, 'student');
    assert.equal(Number(acceptedLogin.id), Number(acceptedRegistration.student.id));
  });

  const teacherModeSettings = await api(primary.baseUrl, '/settings', {
    token: primaryManager.token,
    method: 'PUT',
    body: { ...updatedSettings, quranTaskExecutionSource: 'teacher' },
  });
  const currentTasks = await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-today`, { token: studentA.token });
  const anyCurrentTask = currentTasks.tasks.find((task) => !task.teacherCompleted);
  if (anyCurrentTask) {
    await api(primary.baseUrl, `/students/${primaryStudent.id}/quran-tasks/${anyCurrentTask.id}/execution`, {
      token: studentA.token,
      method: 'POST',
      expected: 409,
      body: { status: 'done' },
    });
  }
  checked('teacher execution mode disables student execution', () => {
    assert.equal(teacherModeSettings.quranTaskExecutionSource, 'teacher');
  });

  await stopApi(primary);
  primary = startApi({
    port: 3311,
    instanceKey: 'primary',
    registrationNumber: 101,
    managerLogin: 1483,
    database: databaseNames.primary,
  });
  await waitForHealth(primary);
  const dataAfterRestart = await api(primary.baseUrl, '/students?committeeId=all', { token: primaryManager.token });
  const settingsAfterRestart = await api(primary.baseUrl, '/settings', { token: primaryManager.token });
  checked('application update-style restart preserves tenant data and sessions', () => {
    assert.equal(dataAfterRestart.length, 2);
    assert.equal(settingsAfterRestart.quranTaskExecutionSource, 'teacher');
  });

  await api(primary.baseUrl, '/notifications/me', { expected: 401 });
  await api(primary.baseUrl, '/notifications/recipients', { expected: 401 });
  await api(primary.baseUrl, '/notifications', {
    token: studentA.token,
    method: 'POST',
    expected: 403,
    body: { title: 'ممنوع', body: 'لا يسمح للطالب بالإرسال', recipientType: 'all' },
  });
  const recipients = await api(primary.baseUrl, '/notifications/recipients', { token: primaryManager.token });
  checked('recipient directory is limited to the current tenant', () => {
    assert.equal(recipients.length, 5);
    assert.ok(recipients.some((recipient) => recipient.key === `student:${primaryStudent.id}`));
    assert.ok(recipients.every((recipient) => recipient.name !== 'طالب تدقيق المجمع الثاني'));
  });

  const managerNotification = await api(primary.baseUrl, '/notifications', {
    token: primaryManager.token,
    method: 'POST',
    expected: 201,
    body: { title: 'إشعار المجمع الأول', body: 'يجب ألا يصل هذا الإشعار للمجمع الثاني.', recipientType: 'all' },
  });
  checked('manager notification reaches every local account', () => assert.equal(managerNotification.recipientsCount, 5));

  const inboxA = await api(primary.baseUrl, '/notifications/me', { token: studentA.token });
  const inboxB = await api(secondary.baseUrl, '/notifications/me', { token: studentB.token });
  checked('notification delivery is tenant isolated', () => {
    assert.equal(inboxA.length, 1);
    assert.equal(inboxA[0].title, 'إشعار المجمع الأول');
    assert.equal(inboxB.length, 0);
  });
  await api(secondary.baseUrl, '/notifications/me', { token: studentA.token, expected: 401 });
  await api(primary.baseUrl, `/notifications/${managerNotification.id}/read`, {
    token: studentA.token,
    method: 'PUT',
    body: {},
  });
  await api(primary.baseUrl, '/notifications/999999/read', {
    token: studentA.token,
    method: 'PUT',
    expected: 404,
    body: {},
  });

  const supervisorNotification = await api(primary.baseUrl, '/notifications', {
    token: supervisorA.token,
    method: 'POST',
    expected: 201,
    body: {
      title: 'إشعار معلم',
      body: 'إشعار محدد للطالب.',
      recipientType: 'specific',
      recipientKeys: [`student:${primaryStudent.id}`],
    },
  });
  checked('authorized teacher can send to a selected local user', () => assert.equal(supervisorNotification.recipientsCount, 1));

  const adminNotification = await api(primary.baseUrl, '/notifications', {
    token: adminA.token,
    method: 'POST',
    expected: 201,
    body: { title: 'إشعار إداري', body: 'إشعار للموظفين فقط.', recipientType: 'staff' },
  });
  checked('authorized administrator can send notifications', () => assert.equal(adminNotification.recipientsCount, 3));

  await api(primary.baseUrl, `/dashboard-permissions/${primarySupervisor.id}`, {
    token: primaryManager.token,
    method: 'PUT',
    body: { permissions: [] },
  });
  await api(primary.baseUrl, '/notifications', {
    token: supervisorA.token,
    method: 'POST',
    expected: 403,
    body: { title: 'ممنوع بعد السحب', body: 'يجب رفض الإرسال فورًا.', recipientType: 'all' },
  });
  await api(primary.baseUrl, '/notifications', {
    token: primaryManager.token,
    method: 'POST',
    expected: 422,
    body: { title: 'لا مستلم', body: 'مفتاح من مجمع أو حساب غير موجود.', recipientType: 'specific', recipientKeys: ['student:999999'] },
  });

  const sent = await api(primary.baseUrl, '/notifications/sent', { token: primaryManager.token });
  checked('sent log and read counters are accurate', () => {
    assert.equal(sent.length, 3);
    const row = sent.find((notification) => notification.id === managerNotification.id);
    assert.equal(row.recipientsCount, 5);
    assert.equal(row.readCount, 1);
  });

  await api(primary.baseUrl, '/account-deletion/me', { expected: 401 });
  await api(primary.baseUrl, '/account-deletion', {
    token: studentA.token,
    method: 'POST',
    expected: 201,
    body: {},
  });
  const deletionRequest = await api(primary.baseUrl, '/account-deletion/me', { token: studentA.token });
  const localDeletionRequests = await api(primary.baseUrl, '/account-deletion/requests', { token: primaryManager.token });
  const otherTenantDeletionRequests = await api(secondary.baseUrl, '/account-deletion/requests', { token: secondaryManager.token });
  checked('account deletion requests are user-accessible and tenant isolated', () => {
    assert.equal(deletionRequest.status, 'pending');
    assert.equal(localDeletionRequests.length, 1);
    assert.equal(Number(localDeletionRequests[0].userId), Number(primaryStudent.id));
    assert.equal(otherTenantDeletionRequests.length, 0);
  });
  await api(primary.baseUrl, '/account-deletion/requests', { token: studentA.token, expected: 403 });
  await api(primary.baseUrl, '/account-deletion', {
    token: studentA.token,
    method: 'DELETE',
  });
  const cancelledDeletionRequest = await api(primary.baseUrl, '/account-deletion/me', { token: studentA.token });
  checked('users can cancel a pending deletion request', () => assert.equal(cancelledDeletionRequest.status, 'cancelled'));
  await api(primary.baseUrl, '/account-deletion', {
    token: studentA.token,
    method: 'POST',
    expected: 201,
    body: {},
  });
  await api(primary.baseUrl, `/account-deletion/requests/${deletionRequest.id}`, {
    token: primaryManager.token,
    method: 'PUT',
    body: { status: 'completed' },
  });
  const completedDeletionRequest = await api(primary.baseUrl, '/account-deletion/me', { token: studentA.token });
  checked('manager can complete a deletion request', () => assert.equal(completedDeletionRequest.status, 'completed'));

  const databaseConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  try {
    const [[primaryCounts]] = await databaseConnection.query(
      `SELECT
        (SELECT COUNT(*) FROM \`${databaseNames.primary}\`.students) AS students,
        (SELECT COUNT(*) FROM \`${databaseNames.primary}\`.app_notifications) AS notifications`,
    );
    const [[secondaryCounts]] = await databaseConnection.query(
      `SELECT
        (SELECT COUNT(*) FROM \`${databaseNames.secondary}\`.students) AS students,
        (SELECT COUNT(*) FROM \`${databaseNames.secondary}\`.app_notifications) AS notifications`,
    );
    const [[sessionSecurity]] = await databaseConnection.query(
      `SELECT
        TIMESTAMPDIFF(DAY, NOW(), MAX(expires_at)) AS maxSessionDays,
        SUM(token_hash = ?) AS rawTenantTokens
       FROM \`${databaseNames.primary}\`.auth_sessions`,
      [primaryManager.token],
    );
    const [[ownerSecurity]] = await databaseConnection.query(
      `SELECT
        password_hash AS passwordHash,
        password_salt AS passwordSalt,
        (SELECT SUM(token_hash = ?) FROM \`${databaseNames.platform}\`.platform_owner_sessions) AS rawOwnerTokens
       FROM \`${databaseNames.platform}\`.platform_owners
       WHERE username = '14831483'
       LIMIT 1`,
      [ownerLogin.token],
    );
    const [schemaTables] = await databaseConnection.query(
      `SELECT TABLE_NAME AS tableName, ENGINE AS engine
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [databaseNames.primary],
    );
    const [missingPrimaryKeys] = await databaseConnection.query(
      `SELECT tables.TABLE_NAME AS tableName
       FROM information_schema.TABLES tables
       LEFT JOIN information_schema.TABLE_CONSTRAINTS constraints
         ON constraints.TABLE_SCHEMA = tables.TABLE_SCHEMA
        AND constraints.TABLE_NAME = tables.TABLE_NAME
        AND constraints.CONSTRAINT_TYPE = 'PRIMARY KEY'
       WHERE tables.TABLE_SCHEMA = ?
         AND tables.TABLE_TYPE = 'BASE TABLE'
         AND constraints.TABLE_NAME IS NULL`,
      [databaseNames.primary],
    );
    const [unindexedForeignKeys] = await databaseConnection.query(
      `SELECT fk_cols.TABLE_NAME AS tableName, fk_cols.COLUMN_NAME AS columnName
       FROM information_schema.KEY_COLUMN_USAGE fk_cols
       WHERE fk_cols.CONSTRAINT_SCHEMA = ?
         AND fk_cols.REFERENCED_TABLE_NAME IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM information_schema.STATISTICS idx
           WHERE idx.TABLE_SCHEMA = fk_cols.CONSTRAINT_SCHEMA
             AND idx.TABLE_NAME = fk_cols.TABLE_NAME
             AND idx.COLUMN_NAME = fk_cols.COLUMN_NAME
             AND idx.SEQ_IN_INDEX = 1
         )`,
      [databaseNames.primary],
    );
    const qualifiedTables = schemaTables.map(({ tableName }) => `\`${databaseNames.primary}\`.\`${tableName}\``).join(', ');
    const [tableChecks] = await databaseConnection.query(
      `CHECK TABLE ${qualifiedTables}`,
    );
    checked('database-level tenant separation is intact', () => {
      assert.equal(Number(primaryCounts.students), 2);
      assert.equal(Number(secondaryCounts.students), 1);
      assert.equal(Number(primaryCounts.notifications), 3);
      assert.equal(Number(secondaryCounts.notifications), 0);
    });
    checked('passwords and session tokens are hashed with finite lifetimes', () => {
      assert.notEqual(ownerSecurity.passwordHash, '14831483');
      assert.ok(String(ownerSecurity.passwordSalt || '').length >= 32);
      assert.equal(Number(sessionSecurity.rawTenantTokens), 0);
      assert.equal(Number(ownerSecurity.rawOwnerTokens), 0);
      assert.ok(Number(sessionSecurity.maxSessionDays) >= 29);
      assert.ok(Number(sessionSecurity.maxSessionDays) <= 30);
    });
    checked('database schema uses healthy InnoDB tables with primary keys', () => {
      assert.ok(schemaTables.length >= 30);
      assert.ok(schemaTables.every(({ engine }) => engine === 'InnoDB'));
      assert.deepEqual(missingPrimaryKeys, []);
      assert.ok(tableChecks.every((row) => row.Msg_type === 'status' && row.Msg_text === 'OK'));
    });
    checked('every foreign key has a leading supporting index', () => {
      assert.deepEqual(unindexedForeignKeys, []);
    });
  } finally {
    await databaseConnection.end();
  }

  console.log(`PASS: ${checks.length} isolated launch, workflow, notification, and tenant checks`);
  checks.forEach((label, index) => console.log(`${index + 1}. ${label}`));
}

async function cleanup() {
  await Promise.all(localServers.map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(children.map((child) => {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', resolve);
      if (process.platform === 'win32') {
        spawn(String.raw`C:\Windows\System32\taskkill.exe`, ['/pid', String(child.pid), '/t', '/f'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        }).once('exit', resolve);
      } else {
        child.kill();
      }
      setTimeout(resolve, 2000);
    });
  }));
  await resetAuditDatabases();
  await rm(nodePath.join(projectRoot, '.audit-whatsapp'), {
    recursive: true,
    force: true,
    maxRetries: 6,
    retryDelay: 500,
  });
}

try {
  await run();
} finally {
  await cleanup();
}
