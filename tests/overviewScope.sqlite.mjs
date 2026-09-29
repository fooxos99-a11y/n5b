import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

test('overview SQL enforces teacher committees even when a different committee is requested', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`CREATE TABLE students (id INTEGER, committee_id INTEGER); CREATE TABLE committees (id INTEGER); CREATE TABLE supervisors (id INTEGER);
      CREATE TABLE supervisor_committees (supervisor_id INTEGER, committee_id INTEGER);
      INSERT INTO students VALUES (1, 10), (2, 10), (3, 20), (4, 30);
      INSERT INTO committees VALUES (10), (20), (30);
      INSERT INTO supervisors VALUES (7), (8);
      INSERT INTO supervisor_committees VALUES (7, 10), (7, 20), (8, 30);`);
    const executor = { query: async (sql, params) => [database.prepare(sql).all(...params)] };
    for (const [options, expected] of [
      [{ auth: { role: 'supervisor', id: 7 } }, 3],
      [{ auth: { role: 'supervisor', id: 7 }, committeeId: 20 }, 1],
      [{ auth: { role: 'supervisor', id: 7 }, committeeId: 30 }, 0],
      [{ auth: { role: 'supervisor', id: 99 } }, 0],
      [{ auth: { role: 'manager', id: 1 } }, 4],
    ]) {
      const scope = createOverviewReportScope(executor, options);
      const [[row]] = await scope.query(`SELECT COUNT(*) AS count FROM students s WHERE s.id > ? AND ${scope.student('s.id')}`, [0]);
      assert.equal(row.count, expected);
    }
    const scope = createOverviewReportScope(executor, { auth: { role: 'supervisor', id: 7 } });
    const [[counts]] = await scope.query(`SELECT (SELECT COUNT(*) FROM committees c WHERE ${scope.committee('c.id')}) AS committees,
      (SELECT COUNT(*) FROM supervisors s WHERE ${scope.staff('s.id')}) AS staff`);
    assert.equal(counts.committees, 2); assert.equal(counts.staff, 1);
    assert.throws(() => createOverviewReportScope(executor, { committeeId: '1 OR 1=1' }), { status: 422 });
  } finally { database.close(); }
});
