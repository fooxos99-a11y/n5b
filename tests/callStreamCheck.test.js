import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { checkCallStream } from '../scripts/check-call-stream.mjs';

test('hosting probe verifies authentication, incremental SSE, caching and buffering failures', async t => {
  let mode = 'stream';
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ authorization: req.headers.authorization, cookie: req.headers.cookie, tenant: req.headers['x-registration-number'] });
    if (!req.headers.authorization && !req.headers.cookie && mode !== 'public') { res.writeHead(401).end(); return; }
    if (mode === 'forbidden') { res.writeHead(403).end(); return; }
    if (mode === 'redirect') { res.writeHead(302, { Location: 'https://elsewhere.example.test/calls/events' }).end(); return; }
    if (mode === 'delayedHeaders') {
      const timer = setTimeout(() => res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(), 1000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    res.writeHead(200, { 'Content-Type': mode === 'html' ? 'text/html' : 'text/event-stream',
      'Cache-Control': mode === 'cacheable' ? 'public, max-age=3600' : 'private, no-store, no-transform',
      ...(mode === 'cached' ? { 'CF-Cache-Status': 'HIT' } : {}),
    });
    res.flushHeaders();
    if (mode === 'buffered') return;
    res.write('data: {"rooms":[]}\n\n');
    if (mode === 'closed') { res.end(); return; }
    const timer = setTimeout(() => res.write(mode === 'unavailable' ? 'event: unavailable\ndata: {}\n\n' : ': heartbeat\n\n'), 50);
    res.on('close', () => clearTimeout(timer));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/calls/events`;
  const options = { url, headers: { Authorization: 'Bearer synthetic-secret', 'X-Registration-Number': 'test-tenant' }, timeoutMs: 2000, frameTimeoutMs: 250 };
  assert.deepEqual(await checkCallStream(options), { ok: true });
  assert.deepEqual(seen.slice(0, 2), [
    { authorization: undefined, cookie: undefined, tenant: 'test-tenant' },
    { authorization: 'Bearer synthetic-secret', cookie: undefined, tenant: 'test-tenant' },
  ]);
  assert.deepEqual(await checkCallStream({ ...options, headers: { Cookie: 'session=synthetic', 'X-Registration-Number': 'test-tenant' } }), { ok: true });
  for (const [failure, message] of [
    ['public', /دون جلسة/], ['forbidden', /HTTP 403/], ['html', /text\/event-stream/],
    ['cacheable', /ترويسات/], ['cached', /مخزنة/], ['buffered', /تأخر SSE/],
    ['closed', /أُغلق/], ['unavailable', /استمرار/], ['redirect', /تعذر الاتصال/], ['delayedHeaders', /تأخر SSE/],
  ]) {
    mode = failure;
    await assert.rejects(checkCallStream(options), message);
  }
  await assert.rejects(checkCallStream({ ...options, headers: {} }), /حساب مصرح/);
  for (const invalid of ['http://public.example.test/calls/events', 'https://secret:password@example.test/calls/events', `${url}?token=secret`, 'invalid']) {
    await assert.rejects(checkCallStream({ ...options, url: invalid }));
  }
});
