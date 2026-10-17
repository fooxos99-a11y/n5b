import test from 'node:test';
import assert from 'node:assert/strict';
import { claimRecitationSession } from '../server/services/offlineRecitation.js';

test('retired correction requests reject every actor before device, session or grade writes', async () => {
 for (const role of ['supervisor', 'manager', 'student']) {
  const connection = { query: () => assert.fail('A correction must not access or mutate stored data') };
  await assert.rejects(claimRecitationSession(connection, {
   req: { auth: { id: 2, role }, body: { correctionOf: 'existing-session' } },
   task: {}, sessionDate: '2026-10-17', requestId: 'new-request',
  }), { statusCode: 409 });
 }
});
