import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { load as isolateServer } from './isolated-server-loader.mjs';

const entry = new URL('../../server/index.js', import.meta.url).href;
/** Keep all application routes real; stop only the external WhatsApp provider before Chromium or authentication initialization. */
export async function load(url, context, nextLoad) {
  const result = await isolateServer(url, context, nextLoad);
  if (url !== entry) return result;
  let source = (typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8')).replaceAll('\r\n', '\n');
  const declaration = 'async function ensureWhatsAppClient()';
  assert.equal(source.split(declaration).length - 1, 1, 'Review the external provider fixture boundary after server changes');
  source = source.replace(declaration, 'async function nativeAdvancedUnusedWhatsAppClient()');
  source += `
async function ensureWhatsAppClient() {
  globalThis.__nukhabAdvancedProviderGuard ||= { whatsAppInitializationsBlocked: 0 };
  globalThis.__nukhabAdvancedProviderGuard.whatsAppInitializationsBlocked += 1;
  const failure = new Error('Synthetic fixture blocked external WhatsApp provider before browser initialization');
  failure.code = 'NATIVE_FIXTURE_EXTERNAL_PROVIDER_DISABLED';
  throw failure;
}
`;
  return { ...result, source };
}
