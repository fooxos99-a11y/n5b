import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('preflight classifies failures without exposing database details or applying migrations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nukhab-preflight-'));
  const put = async (name, text) => {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  const run = (expected) => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/web-release/preflight.mjs', import.meta.url)), root, path.join(root, 'config.json')], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  };
  try {
    await put('package.json', '{"type":"module"}');
    await put('config.json', '{"databases":[]}');
    run(41);
    await put('config.json', '{"databases":["synthetic"]}');
    run(42);
    await put('node_modules/dotenv/lib/main.js', 'exports.parse = () => ({});');
    await put('node_modules/mysql2/promise.js', `exports.createConnection = async () => ({
      query: async sql => {
        if (sql.includes('information_schema')) return [[{ table_name: 'schema_migrations' }]];
        if (sql === 'SELECT version FROM schema_migrations') return [[{ version: 1 }]];
        throw Error('Unexpected database write');
      },
      end: async () => {},
    });`);
    run(43);
    await put('server/databaseMigrations.js', 'export const loadDatabaseMigrations = async () => [{ version: "1", up: () => { throw Error("Must not run"); } }];');
    run(41);
    await put('.env', 'SYNTHETIC=true');
    run(0);
    await put('server/databaseMigrations.js', 'export const loadDatabaseMigrations = async () => [{ version: "2", up: () => { throw Error("Must not run"); } }];');
    run(45);
    await put('node_modules/mysql2/promise.js', 'exports.createConnection = async () => { throw Error("private synthetic connection details"); };');
    run(44);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('receiver exposes only fixed preflight diagnostics', () => {
  const code = `
import importlib.util
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('receiver', 'scripts/web-release/receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)
with patch.object(receiver, 'inside', side_effect=lambda root, value: value), patch.object(receiver.shutil, 'which', return_value='node'), patch.object(receiver.subprocess, 'run') as execute:
    for status in [41, 42, 43, 44, 45, 1]:
        execute.return_value.returncode = status
        execute.return_value.stderr = 'SECRET database details'
        try:
            receiver.run('preflight', release=receiver.Path(receiver.Path.cwd().anchor) / 'github-20260924-120000-aaaaaaaaaaaa')
            raise AssertionError('Failure was ignored')
        except receiver.PreflightFailure as error:
            message = receiver.public_failure(error)
            assert message.startswith('PREFLIGHT_')
            assert 'SECRET' not in message
    assert receiver.public_failure(RuntimeError('SECRET')) == 'Deployment failed'
`;
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
