import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const LOCAL_CALL_DATABASE = 'nukhab_calls_real_local';
export const LOCAL_CALL_PLATFORM_DATABASE = `${LOCAL_CALL_DATABASE}_platform`;
export const localCallEnvironmentPath = fileURLToPath(new URL('../.env.call-archive.local', import.meta.url));
export const localCallRoot = fileURLToPath(new URL('../', import.meta.url));
export const localCallUiRoots = [localCallRoot, path.resolve(localCallRoot, '../../node_modules')];
const containsPath = (parent, child) => {
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(child) === normalize(parent) || normalize(child).startsWith(normalize(parent) + path.sep);
};

export function validateLocalCallEnvironment(source) {
  const value = { ...source };
  const requireValue = (name, expected) => {
    if (String(value[name] || '') !== expected) throw new Error(`Local calls require ${name}=${expected}.`);
  };
  requireValue('MYSQL_HOST', '127.0.0.1');
  requireValue('MYSQL_PORT', '3316');
  requireValue('MYSQL_DATABASE', LOCAL_CALL_DATABASE);
  if (value.PLATFORM_MYSQL_DATABASE && value.PLATFORM_MYSQL_DATABASE !== LOCAL_CALL_PLATFORM_DATABASE) throw new Error('Only the dedicated local platform database is permitted.');
  if (value.API_HOST && value.API_HOST !== '127.0.0.1') throw new Error('The local API must bind to 127.0.0.1.');
  if (value.API_PORT && value.API_PORT !== '3037') throw new Error('The local API is reserved for port 3037.');
  if (value.CALL_ARCHIVE_ENABLED && !['true', 'false'].includes(value.CALL_ARCHIVE_ENABLED)) throw new Error('CALL_ARCHIVE_ENABLED must be true or false.');
  if (value.LIVEKIT_URL) {
    let url;
    try { url = new URL(value.LIVEKIT_URL); } catch { throw new Error('LIVEKIT_URL is invalid.'); }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!['https:', 'wss:', ...(local ? ['http:', 'ws:'] : [])].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('LiveKit requires a secure URL, or loopback HTTP/WS.');
  }
  if (value.CALL_ARCHIVE_STORAGE_PATH) {
    if (!path.isAbsolute(value.CALL_ARCHIVE_STORAGE_PATH)) throw new Error('Local archive storage must be an absolute private path.');
    if (localCallUiRoots.some(root => containsPath(root, value.CALL_ARCHIVE_STORAGE_PATH))) throw new Error('Archive storage must be outside every directory served by the local UI.');
  }
  return { ...value, MYSQL_USER: value.MYSQL_USER || 'root', MYSQL_PASSWORD: value.MYSQL_PASSWORD || '',
    API_HOST: '127.0.0.1', API_PORT: '3037', PLATFORM_MYSQL_DATABASE: LOCAL_CALL_PLATFORM_DATABASE,
    SITE_KEY: 'nukhab', SITE_REGISTRATION_NUMBER: 'local-call-archive', NODE_ENV: 'development',
    PUBLIC_APP_URL: 'http://127.0.0.1:3038', PUBLIC_API_URL: 'http://127.0.0.1:3037/api',
    PLATFORM_PUBLIC_API_URL: 'http://127.0.0.1:3037/api',
    CALL_ARCHIVE_ENABLED: value.CALL_ARCHIVE_ENABLED || 'false',
  };
}

export async function assertLocalCallPrivateStorage(value) {
  if (!value.CALL_ARCHIVE_STORAGE_PATH) return;
  const requested = path.resolve(value.CALL_ARCHIVE_STORAGE_PATH);
  let ancestor = requested, resolved;
  while (!resolved) {
    try { resolved = path.resolve(await realpath(ancestor), path.relative(ancestor, requested)); }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(ancestor) === ancestor) throw new Error('Could not verify the private archive storage path.', { cause: error });
      ancestor = path.dirname(ancestor);
    }
  }
  for (const root of localCallUiRoots) {
    let canonical;
    try { canonical = await realpath(root); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (containsPath(canonical, resolved)) throw new Error('Archive storage resolves inside a directory served by the local UI.');
  }
}

export const hasLocalCallTenantOverride = req => [req.body?.registrationNumber, req.query?.registrationNumber, req.get?.('x-registration-number')].some(value => value != null && String(value).trim() !== '');
export function isLocalCallApiRequestAllowed(req) {
  const route = String(req.path || '').toLowerCase();
  if (hasLocalCallTenantOverride(req) || /^\/api\/(?:platform|whatsapp|backups)(?:\/|$)/.test(route)) return false;
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || /^\/api\/(?:calls|reciters|teachers)(?:\/|$)/.test(route)
    || /^\/api\/auth\/(?:login|logout)$/.test(route) || route === '/api/livekit/webhook';
}
export function assertLocalCallRegistry(rows) {
  if (rows.some(row => row.databaseName !== LOCAL_CALL_DATABASE)) throw new Error('The local platform registry references a different database; local startup or webhook dispatch was refused.');
}

export async function readLocalCallEnvironment() {
  let source;
  try { source = await readFile(localCallEnvironmentPath, 'utf8'); }
  catch { throw new Error('Create the explicit .env.call-archive.local file before starting local calls.'); }
  const value = validateLocalCallEnvironment(dotenv.parse(source));
  await assertLocalCallPrivateStorage(value);
  return value;
}

export function applyLocalCallEnvironment(value) {
  const selected = name => /^(MYSQL_|PLATFORM_|MANAGER_|LIVEKIT_|CALL_ARCHIVE_|OPENAI_|GEMINI_|PUBLIC_)/.test(name) || ['API_HOST', 'API_PORT', 'SITE_KEY', 'SITE_REGISTRATION_NUMBER', 'NODE_ENV'].includes(name);
  for (const name of Object.keys(process.env)) if (selected(name)) delete process.env[name];
  for (const [name, setting] of Object.entries(value)) if (selected(name) && !/^(MANAGER_|PLATFORM_OWNER|PLATFORM_SINGLE)/.test(name)) process.env[name] = setting;
}
