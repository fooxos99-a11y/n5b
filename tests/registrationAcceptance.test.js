import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
const validation = source.slice(source.indexOf('function normalizeRegistrationTestResults('), source.indexOf('async function saveStandalonePriorMemorizationRanges('));
const route = source.slice(source.indexOf("app.post('/api/registration-requests/:id/accept'"), source.indexOf("app.get('/api/quran/chapters'"));

for (const results of [{a: 'passed', b: 'failed'}, {a: 'failed', b: 'failed'}, {a: 'passed', b: 'passed'}, {a: 'passed'}]) {
  test(`registration acceptance only saves passed memorization: ${JSON.stringify(results)}`, async () => {
    let handler, saved, committed = false, rolledBack = false, status, error;
    const connection = {
      beginTransaction: async () => {}, release() {},
      commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; },
      query: async sql => sql.includes('SELECT id, name FROM committees') ? [[{id: 1, name: 'حلقة'}]] : [{insertId: 10}],
    };
    vm.runInNewContext(validation + route, {
      app: {post: (_path, _permission, callback) => {handler = callback;}}, requirePermission: () => {},
      db: () => ({getConnection: async () => connection}),
      getRegistrationRequestById: async () => ({id: 1, name: 'طالب', age: 12, memorization: {items: [{id: 'a'}, {id: 'b'}]}}),
      normalizeAccountLoginNumber: String, normalizeAccountPhone: String, normalizeOptionalNationalId: String,
      toDigitsOnly: String, normalizeOptionalCommitteeId: Number,
      ensureLoginNumberIsAvailable: async () => {}, assertStudentIdentityAvailable: async () => {},
      normalizeQuranRange: item => item,
      saveStandalonePriorMemorizationRanges: async (_connection, studentId, ranges) => { saved = {studentId, ids: Array.from(ranges, row => row.id)}; },
      loadSettings: async () => ({}), notifyRegistrationRequestPhone: async () => ({status: 'skipped'}),
    });
    const response = {status(value) {status = value; return this;}, json() {}};
    await handler({params: {id: 1}, body: {loginNumber: '12345', committeeId: 1, testResults: results}}, response, reason => {error = reason;});
    if (!results.b) {
      assert.equal(error.statusCode, 422); assert.equal(rolledBack, true); assert.equal(saved, undefined);
    } else {
      assert.equal(error, undefined); assert.equal(status, 201); assert.equal(committed, true);
      assert.deepEqual(saved, {studentId: 10, ids: Object.keys(results).filter(key => results[key] === 'passed')});
    }
  });
}
