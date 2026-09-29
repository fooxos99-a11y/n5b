import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import express from 'express';
import mysql from 'mysql2/promise';
import { createDashboardUndo } from '../server/services/dashboardUndo.js';
import { undoDatabase, requireUndoPermission } from '../server/services/undoJournal.js';

// A separate, explicitly started local instance; never loads application .env files.
assert.equal(process.env.UNDO_TEST_MYSQL_PORT, '43307', 'Start the isolated undo test instance first');
const pool = mysql.createPool({ host: '127.0.0.1', port: 43307, user: 'root', database: 'undo_test', connectionLimit: 5 });
const bootstrap = await mysql.createConnection({ host: '127.0.0.1', port: 43307, user: 'root' });
await bootstrap.query('CREATE DATABASE IF NOT EXISTS undo_test');
await bootstrap.end();
await pool.query('CREATE TABLE IF NOT EXISTS items (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, value INT NOT NULL DEFAULT 0)');
await pool.query('CREATE TABLE IF NOT EXISTS children (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, value INT DEFAULT 0, FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE)');
await pool.query('CREATE TABLE IF NOT EXISTS nullable_children (id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, value INT DEFAULT 0, FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE SET NULL)');
await pool.query('CREATE TABLE IF NOT EXISTS settings (setting_key VARCHAR(80) PRIMARY KEY, setting_value TEXT)');
await pool.query('CREATE TABLE IF NOT EXISTS student_news (id INT PRIMARY KEY, content JSON, revision INT DEFAULT 0)');
await pool.query('DELETE FROM children');
await pool.query('DELETE FROM nullable_children');
await pool.query('DELETE FROM items');
await pool.query('DELETE FROM settings');
await pool.query('DELETE FROM student_news');
await pool.query('INSERT INTO student_news VALUES (1, ?, 0)', [JSON.stringify({ entries: [] })]);
let time = 1000;
let permitted = true;
const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use((req, _res, next) => { req.auth = { role: req.get('Role') || 'manager', id: req.get('Actor') || '1', tokenHash: req.get('Session') || 'test-session' }; next(); });
const undo = createDashboardUndo({ db: () => pool, databaseName: () => 'undo_test', hasPermission: async () => permitted, now: () => time, schedule: () => ({ unref() {} }) });
app.use('/api/dashboard-undo', undo.router);
app.use(undo.capture);
app.post('/api/mutate', async (req, res, next) => {
  const connection = await undoDatabase(pool).getConnection();
  requireUndoPermission(['settings']);
  try {
    await connection.beginTransaction();
    for (const command of req.body.commands) await connection.query(command.sql, command.values);
    if (req.body.rollback) await connection.rollback(); else await connection.commit();
    res.json({ success: true });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: error.message });
});
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const execute = async (commands, extra = {}, headers = {}) => {
  const response = await globalThis.fetch(`${base}/api/mutate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dashboard-Undo': '1', ...headers }, body: JSON.stringify({ commands, ...extra }) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('x-powered-by'), null);
  return JSON.parse(response.headers.get('X-Dashboard-Undo') || 'null');
};
const reverse = (action, headers = {}) => globalThis.fetch(`${base}/api/dashboard-undo/${action.id}`, { method: 'POST', headers });
const rows = async table => (await pool.query(`SELECT * FROM ${table} ORDER BY 1`))[0];
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
try {
  await check('insert is committed immediately; undo removes only its inserted row', async () => {
    const action = await execute([{ sql: 'INSERT INTO items (name, value) VALUES (?, ?)', values: ['one', 1] }]);
    assert.ok(action);
    assert.equal((await rows('items')).length, 1);
    assert.equal((await reverse(action)).status, 200);
    assert.equal((await rows('items')).length, 0);
    assert.equal((await reverse(action)).status, 404);
  });
  await pool.query('INSERT INTO items (id, name, value) VALUES (10, ?, 1)', ['existing']);
  await check('multiple writes to one row reverse together', async () => {
    const action = await execute([{ sql: 'UPDATE items SET value = ? WHERE id = ?', values: [2, 10] }, { sql: 'UPDATE items SET value = value + 1 WHERE id = ?', values: [10] }]);
    assert.equal((await rows('items'))[0].value, 3);
    assert.equal((await reverse(action)).status, 200);
    assert.equal((await rows('items'))[0].value, 1);
  });
  await check('a concurrent edit is never overwritten', async () => {
    const action = await execute([{ sql: 'UPDATE items SET value = 2 WHERE id = 10' }]);
    await pool.query('UPDATE items SET value = 4 WHERE id = 10');
    assert.equal((await reverse(action)).status, 409);
    assert.equal((await rows('items'))[0].value, 4);
  });
  await check('deletion restores cascaded and SET NULL children', async () => {
    await pool.query('INSERT INTO children (id, parent_id, value) VALUES (20, 10, 8)');
    await pool.query('INSERT INTO nullable_children (id, parent_id, value) VALUES (21, 10, 9)');
    const action = await execute([{ sql: 'DELETE FROM items WHERE id = ?', values: [10] }]);
    assert.ok(action);
    assert.equal((await rows('children')).length, 0);
    assert.equal((await rows('nullable_children'))[0].parent_id, null);
    assert.equal((await reverse(action)).status, 200);
    assert.equal((await rows('children'))[0].parent_id, 10);
    assert.equal((await rows('nullable_children'))[0].parent_id, 10);
  });
  await check('undo cannot cascade-delete newly added children', async () => {
    const action = await execute([{ sql: 'INSERT INTO items (id, name) VALUES (11, ?)', values: ['another'] }]);
    await pool.query('INSERT INTO children (parent_id, value) VALUES (11, 9)');
    assert.equal((await reverse(action)).status, 409);
    assert.equal((await rows('items')).length, 2);
  });
  await check('bulk upsert restores old settings and removes newly added settings', async () => {
    await pool.query("INSERT INTO settings VALUES ('existing','old')");
    const action = await execute([{ sql: 'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', values: ['existing', 'new', 'added', 'value'] }]);
    assert.ok(action);
    assert.equal((await reverse(action)).status, 200);
    assert.deepEqual(await rows('settings'), [{ setting_key: 'existing', setting_value: 'old' }]);
  });
  await check('news restores content without reusing an old revision', async () => {
    const action = await execute([{ sql: 'UPDATE student_news SET content = ?, revision = revision + 1 WHERE id = 1 AND revision = ?', values: [JSON.stringify({ entries: [{ title: "WHERE ' quoted ; --" }] }), 0] }]);
    assert.equal((await reverse(action)).status, 200);
    const [row] = await rows('student_news');
    assert.deepEqual(row.content, { entries: [] });
    assert.equal(row.revision, 2);
  });
  await check('multiple news updates preserve monotonic revisions when reversed', async () => {
    const commands = ['first', 'second'].map(title => ({ sql: 'UPDATE student_news SET content = ?, revision = revision + 1 WHERE id = 1', values: [JSON.stringify({ entries: [{ title }] })] }));
    const action = await execute(commands);
    assert.equal((await rows('student_news'))[0].revision, 4);
    assert.equal((await reverse(action)).status, 200);
    const [row] = await rows('student_news');
    assert.deepEqual(row.content, { entries: [] });
    assert.equal(row.revision, 6);
  });
  await check('expired, different-account and different-session tokens fail', async () => {
    const action = await execute([{ sql: 'UPDATE items SET value = 7 WHERE id = 10' }]);
    assert.equal((await reverse(action, { Actor: '2' })).status, 404);
    assert.equal((await reverse(action, { Session: 'other' })).status, 404);
    time += 10_001;
    assert.equal((await reverse(action)).status, 410);
  });
  await check('revoked permissions reject undo', async () => {
    const action = await execute([{ sql: 'UPDATE items SET value = 8 WHERE id = 10' }], {}, { Role: 'admin' });
    permitted = false;
    assert.equal((await reverse(action, { Role: 'admin' })).status, 403);
    permitted = true;
  });
  await check('rollback and unsupported mutations never advertise false undo', async () => {
    const rollback = await execute([{ sql: 'UPDATE items SET value = 22 WHERE id = 10' }], { rollback: true });
    assert.equal(rollback, null);
    assert.equal((await rows('items'))[0].value, 8);
    const unsupported = await execute([{ sql: 'UPDATE items i JOIN children c ON c.parent_id = i.id SET i.value = 9 WHERE i.id = 10' }]);
    assert.equal(unsupported, null);
    assert.equal((await rows('items'))[0].value, 9);
  });
  console.log(`${passed} isolated MySQL integration cases passed`);
} finally {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
}
