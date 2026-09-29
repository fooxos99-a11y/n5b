import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRecitationCorrection } from '../server/services/recitationCorrection.js';
import { getBusinessDate } from '../shared/business-date.js';

const request = () => ({
  req: { auth: { id: 2, role: 'supervisor' }, body: { correctionOf: 'old-session' }, recitationTransaction: {}, recitationSessionTaskIds: [10, 11] },
  slot: { sessionId: 'old-session', evaluatorRole: 'supervisor', evaluatorId: 2, planId: 3, planVersion: 1 },
  task: { planId: 3 }, currentPlanVersion: 1, sessionDate: getBusinessDate(),
});
const connection = (later = false) => ({ query: async sql => sql.includes('SELECT task_id')
  ? [[{ taskId: 10 }, { taskId: 11 }]] : [[...(later ? [{ id: 20 }] : [])]] });
test('complete latest same-day evaluation can be corrected by its evaluator', async () => {
  await assertRecitationCorrection(connection(), request());
});
test('correction rejects changed plan, stale session, other evaluator, incomplete batch and old date', async () => {
  for (const change of [
    value => { value.currentPlanVersion = 2; },
    value => { value.req.body.correctionOf = 'stale'; },
    value => { value.req.auth.id = 4; },
    value => { value.req.auth.role = 'manager'; },
    value => { value.req.recitationSessionTaskIds = [10]; },
    value => { value.req.recitationSessionTaskIds = [10, 11, 12]; },
    value => { value.req.recitationTransaction = null; },
    value => { value.sessionDate = '2025-01-01'; },
  ]) {
    const value = request(); change(value);
    await assert.rejects(assertRecitationCorrection(connection(), value), { statusCode: 409 });
  }
});
test('later dependent recitation prevents correction even when all prior task ids are supplied', async () => {
  await assert.rejects(assertRecitationCorrection(connection(true), request()), /جلسة أحدث/);
});
