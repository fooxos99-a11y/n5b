import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { verifyAccountPassword } from '../server/services/accountPassword.js';
import { hashStudentPassword, verifyStudentPassword } from '../server/services/studentPassword.js';

const password = randomBytes(24).toString('base64url');
const manager = { id: 7, role: 'manager', loginNumber: '9917001', passwordHash: null };
const environment = { MANAGER_LOGIN_NUMBER: manager.loginNumber, MANAGER_PASSWORD: password };

function databaseFixture({ hash = null, role = 'manager', active = 1, failRevoke = false } = {}) {
  const state = { hash, revoked: false, committed: false, rolledBack: false, released: false };
  const connection = {
    async beginTransaction() {},
    async query(sql, values) {
      if (sql.startsWith('SELECT')) return [[{ passwordHash: state.hash, role, isActive: active }]];
      if (sql.startsWith('UPDATE')) { state.hash = values[0]; return [{}]; }
      if (sql.startsWith('DELETE')) {
        assert.deepEqual(values, ['manager', manager.id]);
        if (failRevoke) throw new Error('revocation failed');
        state.revoked = true;
        return [{}];
      }
      throw new Error('Unexpected query');
    },
    async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; state.hash = hash; state.revoked = false; },
    release() { state.released = true; },
  };
  return { state, getConnection: async () => connection };
}

test('accounts without password hashes reject empty and arbitrary passwords without a configured manager secret', async () => {
  for (const account of [null, manager, { ...manager, role: 'student' }, { ...manager, role: 'supervisor' }]) {
    for (const candidate of ['', password]) assert.equal(await verifyAccountPassword(account, candidate, null, {}), false);
  }
});

test('bootstrap secret cannot initialize a student, staff member, or different manager', async () => {
  for (const account of [{ ...manager, role: 'student' }, { ...manager, role: 'supervisor' }, { ...manager, loginNumber: 'other' }]) {
    assert.equal(await verifyAccountPassword(account, password, null, environment), false);
  }
  assert.equal(await verifyAccountPassword(manager, 'incorrect', null, environment), false);
});

test('first valid manager password is hashed and old sessions are revoked atomically', async () => {
  const database = databaseFixture();
  assert.equal(await verifyAccountPassword(manager, password, database, environment), true);
  assert.notEqual(database.state.hash, password);
  assert.equal(await verifyStudentPassword(password, database.state.hash), true);
  assert.equal(database.state.revoked, true);
  assert.equal(database.state.committed, true);
  assert.equal(database.state.released, true);
});

test('bootstrap refuses a role or activation change while locking the account', async () => {
  for (const options of [{ role: 'supervisor' }, { active: 0 }]) {
    const database = databaseFixture(options);
    assert.equal(await verifyAccountPassword(manager, password, database, environment), false);
    assert.equal(database.state.hash, null);
    assert.equal(database.state.rolledBack, true);
    assert.equal(database.state.released, true);
  }
});

test('saved password always takes precedence over the bootstrap environment, including concurrent changes', async () => {
  const savedPassword = randomBytes(24).toString('base64url');
  const savedHash = await hashStudentPassword(savedPassword);
  assert.equal(await verifyAccountPassword({ ...manager, passwordHash: savedHash }, password, null, environment), false);
  assert.equal(await verifyAccountPassword({ ...manager, passwordHash: savedHash }, savedPassword, null, environment), true);
  const database = databaseFixture({ hash: savedHash });
  assert.equal(await verifyAccountPassword(manager, password, database, environment), false);
  assert.equal(database.state.hash, savedHash);
  assert.equal(database.state.revoked, false);
});

test('failure to revoke sessions rolls back the first password and releases the connection', async () => {
  const database = databaseFixture({ failRevoke: true });
  await assert.rejects(verifyAccountPassword(manager, password, database, environment), /revocation failed/);
  assert.equal(database.state.hash, null);
  assert.equal(database.state.committed, false);
  assert.equal(database.state.rolledBack, true);
  assert.equal(database.state.released, true);
});
