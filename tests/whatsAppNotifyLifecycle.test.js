import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import nodePath from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';
import { createWhatsAppDispatchJournal, createWhatsAppIdleSession, withWhatsAppDispatchKey } from '../server/services/whatsAppIdleSession.js';

test('the actual guardian notification function deduplicates automatic work while preserving manual sends', async () => {
  const directory = await mkdtemp(nodePath.join(os.tmpdir(), 'whatsapp-notify-'));
  let session;
  try {
    const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function notifyStudentGuardian(');
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(start > 0 && end > start);
    let sent = 0;
    const client = new EventEmitter();
    client.destroy = async () => {};
    client.sendMessage = async () => { sent += 1; return { id: { _serialized: `synthetic-${sent}` }, ack: 2 }; };
    session = createWhatsAppIdleSession({ journal: createWhatsAppDispatchJournal(directory) });
    session.attach(client);
    const database = { query: async (sql) => sql.includes('FROM students') ? [[{ id: 101, name: 'synthetic-student', guardianPhone: 'synthetic@invalid' }]] : [[]] };
    const instantiate = new Function('db', 'normalizeWhatsAppPhone', 'fillWhatsAppTemplate', 'sendWhatsAppMessage', 'withWhatsAppDispatchKey', `${source.slice(start, end)}\nreturn notifyStudentGuardian;`);
    const notify = instantiate(() => database, (value) => value, () => 'synthetic test', (...values) => client.sendMessage(...values), withWhatsAppDispatchKey);
    const context = { messageType: 'absence', date: '2026-10-20' };
    assert.equal(await notify(101, 'synthetic test', context), 'sent');
    assert.equal(await notify(101, 'synthetic test', context), 'sent');
    assert.equal(sent, 1);
    await notify(101, 'synthetic test'); await notify(101, 'synthetic test');
    assert.equal(sent, 3);
  } finally {
    await session?.suspend();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an expired browser cannot publish a QR image after asynchronous rendering finishes', async () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf("      client.on('qr', async (qr) => {");
  const end = source.indexOf("      client.on('ready'", start);
  assert.ok(start > 0 && end > start);
  const handlers = new Map();
  const client = { on: (name, handler) => handlers.set(name, handler) };
  const runtime = { initializingClient: client, state: { status: 'starting', qr: '' } };
  let finish;
  const QRCode = { toDataURL: () => new Promise((resolve) => { finish = resolve; }) };
  const load = new Function('client', 'runtime', 'QRCode', 'whatsAppState', `const startupToken = Symbol(); let whatsAppStartupToken = startupToken;\n${source.slice(start, end)}\nreturn () => { runtime.initializingClient = null; whatsAppStartupToken = null; };`);
  const invalidate = load(client, runtime, QRCode, runtime.state);
  const pending = handlers.get('qr')('synthetic-qr');
  invalidate(); runtime.state.status = 'disconnected';
  finish('data:synthetic-invalid'); await pending;
  assert.equal(runtime.state.qr, '');
  assert.equal(runtime.state.status, 'disconnected');
});
