import assert from 'node:assert/strict';
import process from 'node:process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { URL } from 'node:url';
import dotenv from 'dotenv';

// Dedicated test process: no application .env files, messaging sessions or remote requests.
const input = process.env;
const database = input.QURAN_TEST_MYSQL_DATABASE;
assert.match(database || '', /^quran_audit(?:_[a-z0-9_]+)?$/);
assert.ok(input.QURAN_TEST_MYSQL_USER && input.QURAN_TEST_MYSQL_PORT);
assert.ok(input.QURAN_TEST_REGISTRATION && input.QURAN_TEST_MANAGER_LOGIN && input.QURAN_TEST_API_PORT);
const environment = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
  .filter((key) => input[key]).map((key) => [key, input[key]]));
Object.assign(environment, {
  MYSQL_HOST: '127.0.0.1', MYSQL_PORT: input.QURAN_TEST_MYSQL_PORT,
  MYSQL_USER: input.QURAN_TEST_MYSQL_USER, MYSQL_PASSWORD: input.QURAN_TEST_MYSQL_PASSWORD || '',
  MYSQL_DATABASE: database, PLATFORM_MYSQL_DATABASE: `${database}_platform`,
  API_PORT: input.QURAN_TEST_API_PORT, SITE_REGISTRATION_NUMBER: input.QURAN_TEST_REGISTRATION,
  MANAGER_LOGIN_NUMBER: input.QURAN_TEST_MANAGER_LOGIN, MANAGER_NAME: 'مدير اختبار المصحف',
  PUBLIC_APP_URL: `http://127.0.0.1:${input.QURAN_TEST_UI_PORT || 33310}`,
  PUBLIC_API_URL: `http://127.0.0.1:${input.QURAN_TEST_API_PORT}/api`,
  WHATSAPP_AUTH_PATH: path.resolve('outputs/quran-quality-audit/whatsapp'), SEED_DEFAULT_DATA: 'false',
});
const offset = Number(input.QURAN_TEST_TIME_OFFSET_MS || 0);
const clockFile = input.QURAN_TEST_CLOCK_FILE;
const auditRoot = path.resolve('outputs/quran-quality-audit');
if (clockFile) assert.ok(path.resolve(clockFile).startsWith(`${auditRoot}${path.sep}`));
const now = () => {
  if (!clockFile) return NativeDate.now() + offset;
  const timestamp = NativeDate.parse(readFileSync(clockFile, 'utf8').trim());
  assert.ok(Number.isFinite(timestamp), 'Invalid isolated audit clock');
  return timestamp;
};
assert.ok(Number.isFinite(offset));
process.env = environment;
dotenv.config = () => ({ parsed: {} });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'whatsapp-web.js') {
    return { url: 'data:text/javascript,throw new Error("Messaging disabled in isolated Quran audit")', shortCircuit: true };
  }
  return next(specifier, context);
} });
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'External requests disabled in isolated Quran audit');
  return originalFetch(input, options);
};
const NativeDate = globalThis.Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now()])); }
  static now() { return now(); }
};
await import('../../server/index.js');
