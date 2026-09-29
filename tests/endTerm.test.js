import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('end-term closure is serialized, atomic, and cannot run twice on the same day', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const endpoint = sliceBetween(
    server,
    "app.post('/api/settings/end-term'",
    "app.put('/api/settings'"
  );

  const lockIndex = endpoint.indexOf('acquireNamedLock');
  const transactionIndex = endpoint.indexOf('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  const progressIndex = endpoint.indexOf('buildProgressReport');
  const overviewIndex = endpoint.indexOf('buildOverviewReport');

  assert.ok(lockIndex >= 0 && lockIndex < transactionIndex);
  assert.ok(transactionIndex < progressIndex && progressIndex < overviewIndex);
  assert.match(endpoint, /report_archives WHERE period_to = \?/);
  assert.match(endpoint, /تم إنهاء الفصل لهذا اليوم مسبقًا/);
  assert.match(endpoint, /queryExecutor: connection/g);
  assert.match(endpoint, /loadSettings\(connection\)/);
  assert.match(endpoint, /getFirstReportDate\(connection\)/);
  assert.match(endpoint, /const nextTermStartDate = addUtcDays\(today, 1\)/);
  assert.match(endpoint, /resetAllProgramPoints\(connection\)/);
  assert.match(endpoint, /convertActivePlansToPriorMemorization\(connection\)/);
  assert.match(endpoint, /\[nextTermStartDate\]/);
  assert.match(endpoint, /await connection\.commit\(\)/);
  assert.match(endpoint, /await connection\.rollback\(\)/);
});

test('end-term pauses every active plan after saving its approved memorization', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const conversion = sliceBetween(
    server,
    'async function convertActivePlansToPriorMemorization',
    'function getReportRowValues'
  );

  assert.match(conversion, /approvedOnly: true/);
  assert.match(conversion, /UPDATE student_quran_plans SET status = 'paused' WHERE status IN \('active', 'completed'\)/);
  assert.doesNotMatch(conversion, /nazem/i);
});

test('archived reports use the transaction connection for a consistent snapshot', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const overview = sliceBetween(server, 'async function buildOverviewReport', "app.get('/api/reports/overview'");
  const progress = sliceBetween(server, 'async function buildProgressReport', 'function resolvePdfFontPair');

  for (const reportBuilder of [overview, progress]) {
    assert.match(reportBuilder, /queryExecutor = null/);
    assert.match(reportBuilder, /const reportDb = (?:createOverviewReportScope\()?queryExecutor \|\| db\(\)/);
    assert.match(reportBuilder, /load(?:Settings|GradingPolicy)\(reportDb\)/);
    assert.doesNotMatch(reportBuilder, /await db\(\)\.query/);
  }
  assert.match(progress, /markExpiredPendingQuranTasks\(reportDb, today\)/);
  assert.match(progress, /getPlanProgressContext\(reportDb,/);
});

test('new plans respect the next term start date in the API and dashboard', async () => {
  const [server, plans, settings] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
  ]);
  const savePlanEndpoint = sliceBetween(
    server,
    "app.put('/api/student-plans/:studentId'",
    "app.delete('/api/student-plans/:studentId'"
  );
  const publicSettings = sliceBetween(server, 'function publicSettingsForClient', 'function parseBoolean');

  assert.match(publicSettings, /currentTermStartDate/);
  assert.match(savePlanEndpoint, /const minimumPlanStartDate/);
  assert.match(savePlanEndpoint, /rejectPastNewPlanStart/);
  const dateValidation = server.slice(server.indexOf("async function rejectPastNewPlanStart("));
  assert.match(dateValidation, /startDate < minimumPlanStartDate/);
  assert.match(plans, /setMinimumPlanStartDate/);
  assert.match(plans, /min=\{minimumPlanStartDate\}/);
  assert.match(settings, /يبدأ الفصل الجديد في اليوم التالي/);
});

test('a plan starting today creates its daily tasks before the save transaction commits', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const savePlanEndpoint = sliceBetween(
    server,
    "app.put('/api/student-plans/:studentId'",
    "app.delete('/api/student-plans/:studentId'"
  );
  const generateIndex = savePlanEndpoint.indexOf('ensureStudentPlanTasks(connection, savedPlan, todayDate, planSettings)');
  const commitIndex = savePlanEndpoint.indexOf('await connection.commit()');

  assert.match(savePlanEndpoint, /if \(startDate <= todayDate\)/);
  assert.match(savePlanEndpoint, /getActivePlanForStudent\(connection, studentId\)/);
  assert.ok(generateIndex >= 0 && generateIndex < commitIndex);
});

test('the daily progress report repairs missing tasks for an active plan', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const progress = sliceBetween(server, 'async function buildProgressReport', 'function resolvePdfFontPair');

  assert.match(progress, /if \(startDate <= today && endDate >= today\)/);
  assert.match(progress, /ensureStudentPlanTasks\(reportDb, activePlan, today, settings\)/);
});


test('failed safety backup prevents all term-closing writes and still releases the lock', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const endpoint = sliceBetween(server, "app.post('/api/settings/end-term'", "app.put('/api/settings'");
  let handler;
  const events = [];
  const connection = { query: async () => events.push('query'), beginTransaction: async () => events.push('begin'), release: () => events.push('release') };
  const bind = new Function('app','requirePermission','db','getSaudiDateTimeParts','acquireNamedLock','createDatabaseBackup','releaseNamedLock','siteKey', endpoint);
  bind({post: (_path,_permission,fn) => {handler=fn;}}, () => null, () => ({getConnection:async () => connection}), () => ({date:'2026-09-28'}), async () => 'lock', async () => {throw new Error('backup unavailable');}, async () => events.push('unlock'), 'nukhab');
  let failure;
  await handler({auth:{role:'manager'},body:{confirmText:'إنهاء الفصل'}}, {}, error => {failure=error;});
  assert.equal(failure.message,'backup unavailable');
  assert.deepEqual(events,['unlock','release']);
});
