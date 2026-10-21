import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import process from 'node:process';
import { createPassingGuestFixture } from '../tests/helpers/passingGuestFixture.mjs';
const database = 'nukhab_guest_preview_20261021';
let pool, app;
if (process.argv.includes('--resume')) {
  const saved = JSON.parse(await readFile('outputs/passing-entry/preview-session.local', 'utf8'));
  if (saved.database !== database || process.env.MYSQL_HOST !== '127.0.0.1') throw new Error('Resume requires the existing synthetic loopback preview.');
  Object.assign(process.env, { MYSQL_DATABASE: database, SITE_KEY: 'nukhab', SITE_REGISTRATION_NUMBER: 'passing-local-preview',
    SEED_DEFAULT_DATA: 'false', CALL_ARCHIVE_ENABLED: 'false', PUBLIC_APP_URL: 'http://127.0.0.1:3048',
    PLATFORM_PUBLIC_APP_URL: 'http://127.0.0.1:3048', NODE_ENV: 'test' });
  register(new URL('../tests/fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
  const { initDatabase } = await import('../server/db.js');
  pool = await initDatabase(database, { seedDefaultData: false });
  ({ app } = await import('../server/index.js'));
} else {
  const fixture = await createPassingGuestFixture(database);
  ({ pool, app } = fixture);
  await mkdir('outputs/passing-entry', { recursive: true });
  await writeFile('outputs/passing-entry/private-link.txt', `http://127.0.0.1:3048/passing-entry/${fixture.linkToken}\n`, { mode: 0o600 });
  await writeFile('outputs/passing-entry/preview-session.local', JSON.stringify({ database, staffTokens: fixture.staffTokens }), { mode: 0o600 });
}
const server = app.listen(3047, '127.0.0.1', () => console.log('Passing preview API: http://127.0.0.1:3047. Private link saved under outputs/passing-entry. Synthetic local data only.'));
process.on('SIGINT', () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); server.closeAllConnections(); });
