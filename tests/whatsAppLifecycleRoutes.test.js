import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { URL } from 'node:url';

function fixture() {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.post('/api/whatsapp/connect'");
  const end = source.indexOf("app.post('/api/whatsapp/disconnect'", start);
  assert.ok(start > 0 && end > start);
  const runtime = { state: { ready: false, status: 'idle', qr: '', message: '' } };
  let starts = 0;
  const ensure = async () => { starts += 1; };
  const app = express();
  const requirePermission = (permission) => {
    assert.equal(permission, 'whatsappSend');
    return (req, res, next) => req.get('authorization') === 'synthetic-operator' ? next() : res.sendStatus(403);
  };
  // Execute the actual route definitions against isolated state and a synthetic transport.
  const register = new Function('app', 'requirePermission', 'getWhatsAppRuntime', 'ensureWhatsAppClient', 'refreshWhatsAppState', 'whatsAppState', source.slice(start, end));
  register(app, requirePermission, () => runtime, ensure, ensure, runtime.state);
  return { app, runtime, get starts() { return starts; } };
}

async function withServer(fixture_, operation) {
  const server = fixture_.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await operation(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('passive status never starts a browser, including repeated polling', async () => {
  const f = fixture();
  await withServer(f, async (base) => {
    for (let i = 0; i < 3; i += 1) {
      const response = await fetch(`${base}/api/whatsapp/status?observe=1`, { headers: { authorization: 'synthetic-operator' } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, 'idle');
    }
  });
  assert.equal(f.starts, 0);
});

test('explicit connection starts once; an existing ready session stays ready', async () => {
  const f = fixture();
  await withServer(f, async (base) => {
    const headers = { authorization: 'synthetic-operator' };
    const first = await fetch(`${base}/api/whatsapp/connect`, { method: 'POST', headers });
    assert.equal(first.status, 202);
    assert.equal(f.starts, 1);
    f.runtime.client = {};
    f.runtime.state.ready = true;
    f.runtime.state.status = 'ready';
    const second = await fetch(`${base}/api/whatsapp/connect`, { method: 'POST', headers });
    assert.equal((await second.json()).status, 'ready');
    assert.equal(f.starts, 1);
  });
});

test('unauthorized status and connection cannot start a browser', async () => {
  const f = fixture();
  await withServer(f, async (base) => {
    assert.equal((await fetch(`${base}/api/whatsapp/status?observe=1`)).status, 403);
    assert.equal((await fetch(`${base}/api/whatsapp/connect`, { method: 'POST' })).status, 403);
  });
  assert.equal(f.starts, 0);
});

test('legacy status preserves a suspended session without waking it', async () => {
  const f = fixture();
  f.runtime.state.suspended = true;
  f.runtime.state.ready = true;
  f.runtime.state.status = 'ready';
  await withServer(f, async (base) => {
    const response = await fetch(`${base}/api/whatsapp/status`, { headers: { authorization: 'synthetic-operator' } });
    assert.equal((await response.json()).suspended, true);
  });
  assert.equal(f.starts, 0);
});

test('legacy polling cannot restart an expired QR browser', async () => {
  const f = fixture();
  Object.assign(f.runtime.state, { suspended: true, ready: false, status: 'disconnected' });
  await withServer(f, async (base) => {
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${base}/api/whatsapp/status`, { headers: { authorization: 'synthetic-operator' } });
      assert.equal((await response.json()).suspended, true);
    }
  });
  assert.equal(f.starts, 0);
});
