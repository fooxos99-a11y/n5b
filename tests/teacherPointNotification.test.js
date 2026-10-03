import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { notifyTeacherPointAdjustment } from '../server/services/teacherPointNotification.js';

test('teacher additions and deductions notify only the recipient with the recorded reason', async () => {
  for (const type of ['increase', 'deduction']) {
    const calls = [];
    const connection = { query: async (sql, values) => {
      if (sql.includes('FROM app_settings')) return [[]];
      calls.push({ sql, values });
      return [{ insertId: 91 }];
    } };
    assert.equal(await notifyTeacherPointAdjustment(connection, {
      transactionId: 15, studentId: 8, type, points: 5, reason: 'سبب الاختبار', actor: { id: 3, name: 'مشرف المسار الاختبار' },
    }), 91);
    assert.match(calls[0].values[1], /سبب الاختبار/);
    assert.equal(calls[0].values[0], type === 'increase' ? 'إضافة من مشرف المسار' : 'خصم من مشرف المسار');
    assert.equal(calls[0].values[2], 'teacher-points:15');
    assert.deepEqual(calls[1].values, [91, 8]);
    assert.match(calls[2].sql, /INSERT IGNORE INTO notification_push_deliveries/);
    assert.match(calls[2].sql, /d.user_role = r.user_role AND d.user_id = r.user_id/);
    assert.ok(calls.every(({ sql }) => !/COMMIT|ROLLBACK/.test(sql)));
  }
});

test('no notification for an absent movement and notification failures reach the transaction owner', async () => {
  let calls = 0;
  const connection = { query: async () => { calls++; throw new Error('storage unavailable'); } };
  const input = { transactionId: 1, studentId: 8, points: 0, type: 'increase', actor: { id: 3 }, reason: 'سبب' };
  assert.equal(await notifyTeacherPointAdjustment(connection, input), null);
  assert.equal(calls, 0);
  await assert.rejects(notifyTeacherPointAdjustment(connection, { ...input, points: 5 }), /storage unavailable/);
});

test('the teacher route commits movement and notification together or rolls both back', async () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const routeSource = source.slice(source.indexOf("app.post('/api/teacher-points/adjustments'"), source.indexOf("app.get('/api/reports/grading-sessions'"));
  for (const failNotification of [false, true]) {
    const events = [];
    const connection = {
      beginTransaction: async () => events.push('begin'),
      commit: async () => events.push('commit'),
      rollback: async () => events.push('rollback'),
      release: () => events.push('release'),
      query: async (sql) => {
        if (sql.includes('FROM supervisors')) return [[{ id: 3 }]];
        if (sql.includes('FROM students')) return [[{ id: 8, points: 50 }]];
        if (sql.includes('SUM(points)')) return [[{ used: 0 }]];
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    let handler;
    const context = vm.createContext({
      app: { post: (_url, fn) => { handler = fn; } },
      db: () => ({ getConnection: async () => connection }),
      loadSettings: async () => ({ teacherManualPointsEnabled: true, teacherManualPointsTermLimit: 100,
        teacherPointTypes: [{ id: 'good', label: 'تميز', operation: 'increase', points: 5 }] }),
      getTeacherPointsTermStart: async () => '2026-09-01', getSaudiDateTimeParts: () => ({ date: '2026-09-13' }),
      applyStudentPointDelta: async () => { events.push('points'); return 5; },
      logStudentPointTransaction: async () => { events.push('ledger'); return 41; },
      notifyTeacherPointAdjustment: async (actualConnection, input) => {
        assert.equal(actualConnection, connection);
        assert.equal(input.transactionId, 41);
        assert.equal(input.reason, 'تميز — سبب محدد');
        events.push('notification');
        if (failNotification) throw new Error('inbox unavailable');
      },
    });
    const validationStart = source.indexOf('async function rejectInvalidTeacherPointInput(');
    const validationEnd = source.indexOf('\n}', validationStart) + 2;
    vm.runInContext(source.slice(validationStart, validationEnd), context);
    vm.runInContext(routeSource, context);
    await handler({ auth: { role: 'supervisor', id: 3 }, body: { studentId: 8, adjustmentTypeId: 'good', reason: 'سبب محدد' } },
      { json: () => events.push('response') }, () => events.push('error'));
    assert.deepEqual(events, ['begin', 'points', 'ledger', 'notification',
      ...(failNotification ? ['rollback', 'error'] : ['commit', 'response']), 'release']);
  }
});
