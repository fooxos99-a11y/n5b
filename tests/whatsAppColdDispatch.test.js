import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';
import { createWhatsAppDispatchJournal, createWhatsAppIdleSession, withWhatsAppDispatchKey } from '../server/services/whatsAppIdleSession.js';

test('recorded automatic work cannot wake a cold browser or resend an uncertain message', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whatsapp-cold-'));
  try {
    const journal = createWhatsAppDispatchJournal(directory);
    const manager = createWhatsAppIdleSession({ journal });
    const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function sendWhatsAppMessage(');
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(start > 0 && end > start);
    let starts = 0;
    const load = new Function('getWhatsAppRuntime', 'getWhatsAppIdleSession', 'whatsAppIdleSession', 'refreshWhatsAppState', `${source.slice(start, end)}\nreturn sendWhatsAppMessage;`);
    const send = load(() => ({ client: null }), () => manager, manager, async () => { starts += 1; throw new Error('Synthetic no-network guard.'); });
    const delivered = 'absence:synthetic-student:2026-10-20';
    const entry = await withWhatsAppDispatchKey(delivered, () => journal.begin(['synthetic-phone@c.us', 'test']));
    await journal.complete(entry, { id: { _serialized: 'synthetic-message' }, ack: 2 });
    const result = await withWhatsAppDispatchKey(delivered, () => send('synthetic-phone', 'test'));
    assert.equal(result.ack, 2);
    assert.equal(starts, 0);
    const unknown = 'absence:synthetic-other:2026-10-20';
    await withWhatsAppDispatchKey(unknown, () => journal.begin(['synthetic-phone@c.us', 'test']));
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(withWhatsAppDispatchKey(unknown, () => send('synthetic-phone', 'test')), { code: 'WHATSAPP_DELIVERY_UNCONFIRMED' });
    }
    assert.equal(starts, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
