import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import nodePath from 'node:path';
import os from 'node:os';
import { setTimeout } from 'node:timers';
import { createWhatsAppDispatchJournal, createWhatsAppIdleSession, whatsAppBrowserOptions, withWhatsAppDispatchKey } from '../server/services/whatsAppIdleSession.js';

test('browser wrapper receives a resolved executable with async Puppeteer versions', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const wrapper = process.env.WHATSAPP_BROWSER_WRAPPER;
  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.WHATSAPP_BROWSER_WRAPPER = '/synthetic/browser-wrapper';
    const configured = await whatsAppBrowserOptions({ headless: true });
    assert.equal(configured.executablePath, '/synthetic/browser-wrapper');
    assert.equal(typeof configured.env.WHATSAPP_CHROME_REAL, 'string');
    assert.ok(configured.env.WHATSAPP_CHROME_REAL.length > 0);
    const explicit = await whatsAppBrowserOptions({ executablePath: '/synthetic/chrome' });
    assert.equal(explicit.env.WHATSAPP_CHROME_REAL, '/synthetic/chrome');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    if (wrapper === undefined) delete process.env.WHATSAPP_BROWSER_WRAPPER;
    else process.env.WHATSAPP_BROWSER_WRAPPER = wrapper;
  }
});

function fixture(options = {}) {
  const timers = new Map();
  let sequence = 0;
  const client = new EventEmitter();
  client.destroyCalls = 0;
  client.logoutCalls = 0;
  client.destroy = options.destroy || (async () => { client.destroyCalls += 1; });
  client.logout = async () => { client.logoutCalls += 1; };
  client.sendMessage = options.transport || (async () => ({ id: { _serialized: 'synthetic-message' }, ack: 0 }));
  const suspended = [];
  const session = createWhatsAppIdleSession({
    ...options,
    schedule: (callback, milliseconds) => { const id = ++sequence; timers.set(id, { callback, milliseconds }); return id; },
    cancel: (id) => timers.delete(id),
    onSuspend: (...values) => suspended.push(values),
  });
  session.attach(client);
  return { session, client, timers, suspended, expire: async () => { const value = [...timers.values()][0]; timers.clear(); value.callback(); await session.waitForClose(); } };
}

test('unused QR browser sleeps without logout', async () => {
  const f = fixture();
  assert.equal([...f.timers.values()][0].milliseconds, 120_000);
  await f.expire();
  assert.equal(f.client.destroyCalls, 1);
  assert.equal(f.client.logoutCalls, 0);
  assert.equal(f.suspended[0][1].linked, false);
});

test('shutdown closes Puppeteer 25 browsers when the SDK only checks the removed isConnected method', async () => {
  const f = fixture();
  let browserCloses = 0;
  f.client.pupBrowser = { connected: true, close: async () => { browserCloses += 1; } };
  await f.expire();
  assert.equal(f.client.destroyCalls, 1);
  assert.equal(browserCloses, 1);
  assert.equal(f.client.logoutCalls, 0);
});

test('linked browser sleeps after five minutes and preserves linking', async () => {
  const f = fixture(); f.client.emit('ready');
  assert.equal([...f.timers.values()][0].milliseconds, 300_000);
  await f.expire();
  assert.equal(f.suspended[0][1].linked, true);
  assert.equal(f.client.logoutCalls, 0);
});

test('idle closure waits until an in-flight send finishes', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const f = fixture();
  const sending = f.session.use(() => pending);
  assert.equal(f.timers.size, 0);
  assert.equal(await f.session.suspend(), false);
  assert.equal(f.client.destroyCalls, 0);
  finish(); await sending;
  assert.equal(f.timers.size, 1);
  await f.expire();
  assert.equal(f.client.destroyCalls, 1);
});

test('single close is shared by concurrent callers and the next client waits', async () => {
  let finish;
  const f = fixture();
  f.client.destroy = () => new Promise((resolve) => { finish = resolve; });
  const a = f.session.suspend();
  const b = f.session.suspend();
  assert.throws(() => f.session.attach(new EventEmitter()), /already active/);
  finish();
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
});

test('old ready events cannot revive an expired browser', async () => {
  const f = fixture(); await f.expire(); f.client.emit('ready');
  assert.equal(f.timers.size, 0);
  await assert.rejects(f.client.sendMessage('synthetic@invalid', 'test'), { code: 'WHATSAPP_SESSION_SUSPENDED' });
});

test('dispatch journal records submission without claiming recipient delivery', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    const journal = createWhatsAppDispatchJournal(directory);
    const f = fixture({ journal });
    await f.client.sendMessage('synthetic@invalid', 'test');
    const files = await readdir(directory);
    const saved = JSON.parse(await readFile(nodePath.join(directory, files[0]), 'utf8'));
    assert.equal(saved.state, 'submitted');
    assert.equal(saved.messageId, 'synthetic-message');
    assert.equal(saved.ack, 0);
    assert.equal(saved.arguments, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a real wrapper failure records uncertainty and invokes transport only once', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    let calls = 0;
    const f = fixture({ journal: createWhatsAppDispatchJournal(directory), transport: async () => {
      calls += 1;
      throw new Error('Synthetic connection interruption.');
    } });
    await assert.rejects(f.client.sendMessage('synthetic@invalid', 'test'), { deliveryUnconfirmed: true });
    assert.equal(calls, 1);
    const files = await readdir(directory);
    const saved = JSON.parse(await readFile(nodePath.join(directory, files[0]), 'utf8'));
    assert.equal(saved.state, 'unconfirmed');
    assert.deepEqual(saved.arguments, ['synthetic@invalid', 'test']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('outbox backpressure rejects before any transmission', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    let calls = 0;
    const f = fixture({ journal: createWhatsAppDispatchJournal(directory, { maxBytes: 1 }), transport: async () => { calls += 1; } });
    await assert.rejects(f.client.sendMessage('synthetic@invalid', 'test'), { code: 'WHATSAPP_OUTBOX_FULL' });
    assert.equal(calls, 0);
    assert.equal((await readdir(directory)).length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a wrapped send holds the idle lease until transport settles', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const f = fixture({ transport: () => pending });
  const sending = f.client.sendMessage('synthetic@invalid', 'test');
  assert.equal(f.timers.size, 0);
  assert.equal(await f.session.suspend(), false);
  finish({ id: { _serialized: 'synthetic-message' } }); await sending;
  assert.equal(f.timers.size, 1);
});

test('failed transmission stays unconfirmed with original synthetic payload', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    const journal = createWhatsAppDispatchJournal(directory);
    const entry = await journal.begin(['synthetic@invalid', 'test']);
    await journal.unconfirmed(entry);
    const saved = JSON.parse(await readFile(entry.file, 'utf8'));
    assert.equal(saved.state, 'unconfirmed');
    assert.deepEqual(saved.arguments, ['synthetic@invalid', 'test']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('automatic reminders reuse the submitted attempt across process restarts', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    let calls = 0;
    const transport = async () => { calls += 1; return { id: { _serialized: 'synthetic-automatic' }, ack: 1 }; };
    const first = fixture({ journal: createWhatsAppDispatchJournal(directory), transport });
    const second = fixture({ journal: createWhatsAppDispatchJournal(directory), transport });
    await withWhatsAppDispatchKey('absence:synthetic-student:2026-10-20', () => first.client.sendMessage('synthetic@invalid', 'test'));
    const replay = await withWhatsAppDispatchKey('absence:synthetic-student:2026-10-20', () => second.client.sendMessage('synthetic@invalid', 'test'));
    assert.equal(calls, 1);
    assert.equal(replay.ack, 1);
    await withWhatsAppDispatchKey('absence:synthetic-student:2026-10-21', () => second.client.sendMessage('synthetic@invalid', 'test'));
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an interrupted automatic dispatch is held for review instead of repeating it', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    let calls = 0;
    const f = fixture({ journal: createWhatsAppDispatchJournal(directory), transport: async () => { calls += 1; throw new Error('Synthetic interruption.'); } });
    const send = () => withWhatsAppDispatchKey('absence:synthetic-student:2026-10-20', () => f.client.sendMessage('synthetic@invalid', 'test'));
    await assert.rejects(send());
    await assert.rejects(send(), { code: 'WHATSAPP_DELIVERY_UNCONFIRMED' });
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('intentional manual sends remain independent', async () => {
  let calls = 0;
  const f = fixture({ transport: async () => { calls += 1; return {}; } });
  await f.client.sendMessage('synthetic@invalid', 'test');
  await f.client.sendMessage('synthetic@invalid', 'test');
  assert.equal(calls, 2);
});

test('two independent clients cannot dispatch the same automatic notification concurrently', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-journal-'));
  try {
    let calls = 0;
    const transport = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 30)); return { id: { _serialized: 'synthetic-concurrent' }, ack: 1 }; };
    const first = fixture({ journal: createWhatsAppDispatchJournal(directory), transport });
    const second = fixture({ journal: createWhatsAppDispatchJournal(directory), transport });
    const send = (f) => withWhatsAppDispatchKey('absence:synthetic-student:2026-10-20', () => f.client.sendMessage('synthetic@invalid', 'test'));
    const results = await Promise.allSettled([send(first), send(second)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length >= 1, true);
    assert.equal(calls, 1);
    await send(second);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('external cleanup waits before a replacement client may acquire the profile', async () => {
  let finish;
  const f = fixture({ destroy: () => new Promise((resolve) => { finish = resolve; }) });
  const closing = f.client.destroy();
  assert.throws(() => f.session.attach(new EventEmitter()), /already active/);
  finish(); await closing; await f.session.waitForClose();
  assert.equal(f.timers.size, 0);
});

test('an explicit logout releases the managed browser before the next connection', async () => {
  const f = fixture();
  await f.client.logout();
  assert.equal(f.client.logoutCalls, 1);
  assert.equal(f.client.destroyCalls, 1);
  const replacement = new EventEmitter();
  replacement.destroy = async () => {};
  f.session.attach(replacement);
  await f.session.suspend();
});
