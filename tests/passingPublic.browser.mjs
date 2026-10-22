import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { preview } from 'vite';
import { chromium, webkit } from 'playwright';
import { createPassingGuestFixture } from './helpers/passingGuestFixture.mjs';

const database = `nukhab_guest_test_${randomBytes(8).toString('hex')}`;
const { pool, app, staffTokens } = await createPassingGuestFixture(database);
const api = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const receivedSessions = [];
api.prependListener('request', request => {
  if (request.url === '/api/passing/guest/session/public') receivedSessions.push({ cookie: Boolean(request.headers.cookie), link: Boolean(request.headers['x-passing-link']) });
});
let server;
const out = 'outputs/passing-public-20261022', results = [];
await mkdir(out, { recursive: true });
try {
  // Public entry works even when no private link has ever been configured.
  await pool.query('DELETE FROM app_settings WHERE setting_key=?', ['passingEntryTokenHash']);
  server = await preview({ configFile: false, build: { outDir: 'dist/nukhab' },
    preview: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${api.address().port}` } }, logLevel: 'error' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
        await context.addInitScript(() => {
          globalThis.localStorage.setItem('wajeh_role', 'manager');
          globalThis.localStorage.setItem('nukhab_web_session', '1');
          globalThis.passingCredentialModes = [];
          const originalFetch = globalThis.fetch;
          globalThis.fetch = (input, options) => {
            if (String(input).endsWith('/passing/guest/session/public')) globalThis.passingCredentialModes.push(options?.credentials);
            return originalFetch(input, options);
          };
        });
        await context.addCookies([{ name: 'nukhab_session', value: staffTokens.manager, url: base }]);
        const page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(new URL(request.url()).pathname));
        await page.goto(base + '/test');
        await page.locator('#startup-splash').waitFor({ state: 'detached' });
        const enter = page.getByRole('button', { name: 'دخول', exact: true });
        assert.equal(await enter.isDisabled(), true);
        assert.equal(await page.locator('header button').count(), 0);
        await page.screenshot({ path: `${out}/name-${engine}-${width}.png`, fullPage: true });
        await page.getByLabel('اسم المقرئ', { exact: true }).fill('مقرئ الرابط العام');
        const opened = page.waitForResponse(response => response.url().endsWith('/passing/guest/session/public'));
        await enter.click();
        const response = await opened;
        assert.equal(response.status(), 201);
        const headers = await response.request().allHeaders();
        assert.equal(headers['x-passing-link'], undefined);
        assert.equal(receivedSessions.at(-1).link, false);
        assert.deepEqual(await page.evaluate(() => globalThis.passingCredentialModes), ['omit']);
        const session = await response.json();
        // Some WebKit runtimes still send same-origin cookies with credentials:omit.
        // An administrative cookie must never expand a passing session's authority.
        const authorization = await page.evaluate(async token => {
          const denied = await globalThis.fetch('/api/settings', { headers: { 'X-Passing-Session': token }, credentials: 'include' });
          const missing = await globalThis.fetch('/api/passing/guest/students', { credentials: 'include' });
          return [denied.status, missing.status];
        }, session.token);
        assert.deepEqual(authorization, [403, 401]);
        const student = page.getByRole('button', { name: 'اختبار طالب الاجتياز المحلي', exact: true });
        await student.waitFor();
        await student.click();
        await page.getByRole('heading', { name: 'الجزء 1', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'الجزء 2', exact: true }).waitFor();
        await page.getByRole('button', { name: 'التقرير المجمّع', exact: true }).click();
        await page.getByRole('region', { name: 'ملخص الاختبارات' }).waitFor();
        assert.equal(await page.locator('header button').count(), 0);
        assert.equal(await page.getByRole('alert').count(), 0);
        await page.waitForFunction(() => globalThis.document.fonts.status === 'loaded');
        assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
        assert.ok(!requests.some(path => /offline-recitation|dashboard-bootstrap/.test(path)));
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${out}/report-${engine}-${width}.png`, fullPage: true });
        results.push({ engine, width, publicEntry: true, requestedCredentialsOmit: true, transportCookieObserved: receivedSessions.at(-1).cookie,
          administrativeCookieCannotGrantAccess: true, partsAndReport: true, headerHidden: true });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${out}/browser.json`, JSON.stringify(results, null, 2));
  globalThis.console.log(`Public passing: ${results.length} real API Chromium/WebKit cases passed.`);
} finally {
  if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); }
  await new Promise(resolve => { api.close(resolve); api.closeAllConnections(); });
  await pool.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_guest_test_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE \`${database}\``); } finally { await connection.end(); }
}
