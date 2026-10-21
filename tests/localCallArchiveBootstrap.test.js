import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, symlink, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateLocalCallEnvironment, localCallRoot, hasLocalCallTenantOverride, isLocalCallApiRequestAllowed, assertLocalCallRegistry, assertLocalCallPrivateStorage } from '../scripts/call-archive-local-config.mjs';
import { isolateLocalCallArchiveSource } from '../scripts/call-archive-local-loader.mjs';
import { seedLocalCallPreview } from '../scripts/seed-local-call-preview.mjs';

const baseline = { MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3316', MYSQL_DATABASE: 'nukhab_calls_real_local' };

test('preview seeding refuses active recording, remote storage and a mismatched live SQL connection before writing', async () => {
  let connected = false, released = false;
  const pool = { getConnection: async () => {
    connected = true;
    return { query: async sql => {
      assert.equal(sql, 'SELECT DATABASE() AS name, @@port AS port');
      return [[{ name: 'different_database', port: 3316 }]];
    }, rollback: async () => {}, release: () => { released = true; } };
  } };
  const config = { ...baseline, CALL_ARCHIVE_ENABLED: 'false', CALL_ARCHIVE_FFMPEG_PATH: process.execPath };
  await assert.rejects(() => seedLocalCallPreview(pool, { ...config, MYSQL_HOST: 'remote.invalid' }), /MYSQL_HOST/);
  await assert.rejects(() => seedLocalCallPreview(pool, { ...config, CALL_ARCHIVE_ENABLED: 'true' }), /disabled recording/);
  await assert.rejects(() => seedLocalCallPreview(pool, { ...config, CALL_ARCHIVE_S3_BUCKET: 'remote' }), /private local storage/);
  assert.equal(connected, false);
  await assert.rejects(() => seedLocalCallPreview(pool, config), /database scope was refused/);
  assert.equal(released, true);
});
test('local call launcher rejects database/listener/public-storage mistakes and keeps AI optional', () => {
  const config = validateLocalCallEnvironment(baseline);
  assert.equal(config.CALL_ARCHIVE_ENABLED, 'false');
  assert.equal(config.API_PORT, '3037');
  assert.equal(config.PLATFORM_MYSQL_DATABASE, 'nukhab_calls_real_local_platform');
  assert.equal(config.OPENAI_API_KEY, undefined);
  assert.equal(validateLocalCallEnvironment({ ...baseline, LIVEKIT_URL: 'wss://nonproduction-example.invalid' }).LIVEKIT_URL, 'wss://nonproduction-example.invalid');
  for (const extra of [{ MYSQL_HOST: 'remote.invalid' }, { MYSQL_PORT: '3312' }, { MYSQL_DATABASE: 'wajeh_nukhab' },
    { PLATFORM_MYSQL_DATABASE: 'wajeh_platform' }, { API_HOST: '0.0.0.0' }, { API_PORT: '3002' },
    { LIVEKIT_URL: 'http://remote.invalid' }, { LIVEKIT_URL: 'wss://user:password@remote.invalid' },
    { CALL_ARCHIVE_STORAGE_PATH: path.join(localCallRoot, 'public', 'recordings') }, { CALL_ARCHIVE_STORAGE_PATH: 'relative-path' },
    { CALL_ARCHIVE_STORAGE_PATH: localCallRoot }, { CALL_ARCHIVE_STORAGE_PATH: path.join(localCallRoot, 'src', 'private-recordings') },
    { CALL_ARCHIVE_STORAGE_PATH: path.join(localCallRoot, 'dist', 'private-recordings') }]) {
    assert.throws(() => validateLocalCallEnvironment({ ...baseline, ...extra }), Error);
  }
});

test('local route and registry guards reject tenant changes and mixed-case external integrations', () => {
  for (const req of [{ body: { registrationNumber: '100001' } }, { query: { registrationNumber: '100001' } }, { get: () => '100001' }]) assert.equal(hasLocalCallTenantOverride(req), true);
  assert.equal(hasLocalCallTenantOverride({ get: () => '' }), false);
  for (const method of ['GET', 'HEAD', 'POST']) for (const route of ['/api/WhatsApp/status', '/API/PLATFORM/complexes', '/api/Backups']) assert.equal(isLocalCallApiRequestAllowed({ method, path: route }), false);
  for (const route of ['/api/calls', '/api/calls/archive/sessions/id/review', '/api/reciters', '/api/reciters/1', '/api/teachers', '/api/teachers/1', '/api/auth/login', '/api/auth/logout', '/api/livekit/webhook']) assert.equal(isLocalCallApiRequestAllowed({ method: 'POST', path: route }), true);
  assert.throws(() => assertLocalCallRegistry([{ databaseName: 'different_database' }]), /different database/);
  assert.doesNotThrow(() => assertLocalCallRegistry([{ databaseName: 'nukhab_calls_real_local' }]));
});

test('private storage cannot follow an external junction back into served source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nukhab-call-storage-guard-'));
  const junction = path.join(directory, 'served-source');
  let linked = false;
  try {
    await symlink(localCallRoot, junction, process.platform === 'win32' ? 'junction' : 'dir');
    linked = true;
    await assert.rejects(() => assertLocalCallPrivateStorage({ CALL_ARCHIVE_STORAGE_PATH: path.join(junction, 'not-created', 'recordings') }), /served by the local UI/);
  } finally {
    if (linked) await unlink(junction);
    await rmdir(directory);
  }
});

test('local app loader preserves production routes/auth and refuses an unknown bootstrap', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const isolated = isolateLocalCallArchiveSource(source);
  for (const required of ["app.use('/api/calls', callRouter)", "app.use('/api/calls/archive', callArchiveRouter)",
    "app.use('/api/auth', tenantAuthRouter)", 'async function authorizeApiRequest', 'function isPublicApiRequest']) {
    assert.ok(source.includes(required)); assert.ok(isolated.includes(required));
  }
  assert.ok(isolated.endsWith('export { app as localCallArchiveApp };\n'));
  assert.equal(isolated.includes('\nstartRuntimeDiagnostics();\n'), false);
  assert.equal(isolated.includes('await refreshWhatsAppState({ waitMs: 15000 });'), false);
  assert.throws(() => isolateLocalCallArchiveSource(source.replace('await ensureManagerSupervisorAccount();', 'await alteredStartup();')), /boundaries changed/);
  assert.throws(() => isolateLocalCallArchiveSource(source.replace('startAutomaticAbsenceScheduler();', 'startAutomaticAbsenceScheduler();\n await refreshWhatsAppState({ waitMs: 15000 });')), /boundaries changed/);
  assert.throws(() => isolateLocalCallArchiveSource(source.replace('startRuntimeDiagnostics();', 'startRuntimeDiagnostics(true);')), /startup changed/);
});
