import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { evaluateTrackSession, evaluateWeeklySession } from '../shared/grading-engine.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

const source = await readFile(new URL('../src/components/dashboard/grades/useOptimisticSession.js', import.meta.url), 'utf8');
test('attendance is selected before saving, rolls back on rejection, and stays isolated from another week/circle', () => {
  for (const component of ['weekly', 'track']) {
    let state = null;
    const context = vm.createContext({ evaluateTrackSession, evaluateWeeklySession,
      useState: () => [state, value => { state = typeof value === 'function' ? value(state) : value; }],
    });
    vm.runInContext(source.replace(/import[\s\S]*?;/g, '').replace('export default ', ''), context);
    const week = { weekStart: '2026-09-20', policy: normalizeGradingPolicy(), students: [{ id: 3, grade: {} }] };
    const hook = () => context.useOptimisticSession(week, '1', component);
    hook().begin(week.students[0], { attended: true, segments: [{ recorded: false }] });
    assert.equal(hook().students[0].grade[`${component}Detail`].attended, true);
    assert.equal(context.useOptimisticSession(week, '2', component).students[0].grade[`${component}Detail`], undefined);
    assert.equal(context.useOptimisticSession({ ...week, weekStart: '2026-09-27' }, '1', component).students[0].grade[`${component}Detail`], undefined);
    hook().clear(); assert.equal(hook().students[0].grade[`${component}Detail`], undefined);
    for (const attendanceStatus of ['late', 'excused']) {
      hook().begin(week.students[0], { attendanceStatus, segments: [{ recorded: false }, { recorded: false }] });
      assert.equal(hook().students[0].grade[`${component}Detail`].attendanceStatus, attendanceStatus);
      assert.equal(hook().students[0].grade[`${component}Detail`].attended, attendanceStatus === 'late');
      hook().clear(); assert.equal(hook().students[0].grade[`${component}Detail`], undefined);
    }
  }
});
