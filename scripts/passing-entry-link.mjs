import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db, initDatabase } from '../server/db.js';
import { PASSING_LINK_KEY, passingTokenHash } from '../server/services/passingGuest.js';

// Explicit CLI operation only. Never generated or advertised by a public API.
const args = process.argv.slice(2);
const disable = args.includes('--disable');
const rotate = args.includes('--rotate');
const baseValue = args.find(value => value.startsWith('--base-url='))?.slice('--base-url='.length);
if (!disable && (!baseValue || !rotate)) throw new Error('Specify --rotate --base-url=<verified app URL>, or --disable.');
const base = baseValue ? new URL(baseValue) : null;
if (base && (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)) throw new Error('Use a verified app base URL without credentials, query or fragment.');
if (base?.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('External links require HTTPS.');
if (!process.env.MYSQL_HOST || !process.env.MYSQL_DATABASE) throw new Error('Configure the verified MYSQL_HOST and MYSQL_DATABASE explicitly before changing the private link.');
await initDatabase();
try {
  const token = disable ? '' : randomBytes(32).toString('hex');
  await db().query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [PASSING_LINK_KEY, token ? passingTokenHash(token) : '']);
  await db().query('DELETE FROM passing_guest_sessions');
  if (base) {
    base.pathname = `${base.pathname.replace(/\/$/, '')}/passing-entry/${token}`;
    const directory = resolve('outputs/passing-entry');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'private-link.txt'), base.href + '\n', { mode: 0o600 });
    console.log('Private link saved to outputs/passing-entry/private-link.txt. Previous links and sessions are revoked.');
  } else console.log('Passing entry disabled; all guest sessions revoked.');
} finally { await db().end(); }
