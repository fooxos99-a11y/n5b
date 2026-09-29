import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';
import { createUndoSqlPlan, mutationTable, quoteIdentifier } from './undoSqlPlan.js';

export const undoContext = new AsyncLocalStorage();
const MAX_ROWS = 250;
const MAX_BYTES = 16 * 1024 * 1024;
const ignoredTables = new Set(['activity_logs']);
const nonReversibleTables = new Set(['auth_sessions', 'push_subscriptions', 'whatsapp_messages', 'app_notifications', 'app_notification_recipients', 'notification_push_jobs']);

export function requireUndoPermission(keys) {
  const journal = undoContext.getStore();
  if (journal && !journal.closed) journal.permissions.push(keys);
}

export async function tableMetadata(connection, table) {
  const escaped = quoteIdentifier(table);
  const [columns] = await connection.query(`SHOW COLUMNS FROM ${escaped}`);
  const [indexes] = await connection.query(`SHOW INDEX FROM ${escaped}`);
  const unique = new Map();
  for (const index of indexes) {
    if (Number(index.Non_unique) || !index.Column_name) continue;
    if (!unique.has(index.Key_name)) unique.set(index.Key_name, []);
    unique.get(index.Key_name)[Number(index.Seq_in_index) - 1] = index.Column_name;
  }
  const primaryKey = unique.get('PRIMARY');
  if (!primaryKey?.length || columns.some(column => /GENERATED/i.test(column.Extra || ''))) throw new Error('Unsupported undo table');
  return { table, columns: columns.map(column => column.Field), jsonColumns: columns.filter(column => column.Type === 'json').map(column => column.Field),
    autoIncrement: columns.filter(column => /auto_increment/i.test(column.Extra || '')).map(column => column.Field),
    nullableDefault: columns.filter(column => column.Null === 'YES' && column.Default === null).map(column => column.Field),
    primaryKey, uniqueKeys: [...unique.values()] };
}

const identity = (meta, row) => JSON.stringify([meta.table, ...meta.primaryKey.map(key => row[key])]);
const writableRow = (meta, row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
  meta.jsonColumns.includes(key) && value !== null ? JSON.stringify(value) : value]));
const predicate = (meta, rows) => ({
  sql: rows.map(() => '(' + meta.primaryKey.map(key => `${quoteIdentifier(key)} <=> ?`).join(' AND ') + ')').join(' OR '),
  values: rows.flatMap(row => meta.primaryKey.map(key => row[key])),
});

async function selectRows(connection, meta, selector, values = []) {
  const [rows] = await connection.query(`SELECT * FROM ${quoteIdentifier(meta.table)} WHERE ${selector} LIMIT ${MAX_ROWS + 1} FOR UPDATE`, values);
  if (rows.length > MAX_ROWS) throw new Error('Undo row limit exceeded');
  return rows;
}

async function references(connection, table) {
  const [rows] = await connection.query(`SELECT k.TABLE_NAME AS childTable, k.COLUMN_NAME AS childColumn,
    k.REFERENCED_COLUMN_NAME AS parentColumn, k.CONSTRAINT_NAME AS constraintName,
    r.DELETE_RULE AS deleteRule FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
      AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
    WHERE k.CONSTRAINT_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = ? ORDER BY k.ORDINAL_POSITION`, [table]);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.childTable}:${row.constraintName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

async function childRows(connection, relation, parentRows) {
  const meta = await tableMetadata(connection, relation[0].childTable);
  const sql = parentRows.map(() => '(' + relation.map(column => `${quoteIdentifier(column.childColumn)} = ?`).join(' AND ') + ')').join(' OR ');
  const values = parentRows.flatMap(row => relation.map(column => row[column.parentColumn]));
  return { meta, rows: await selectRows(connection, meta, sql, values) };
}

async function captureChildren(connection, snapshots, seen, depth = 0) {
  if (depth > 12) throw new Error('Undo relationship limit exceeded');
  const parent = snapshots.at(-1);
  if (!parent.rows.length) return;
  for (const relation of await references(connection, parent.meta.table)) {
    if (!['CASCADE', 'SET NULL'].includes(relation[0].deleteRule)) continue;
    const child = await childRows(connection, relation, parent.rows);
    if (child.rows.length && nonReversibleTables.has(child.meta.table)) throw new Error('Linked side effects cannot be reversed');
    child.rows = child.rows.filter(row => !seen.has(identity(child.meta, row)));
    child.rows.forEach(row => seen.add(identity(child.meta, row)));
    if (!child.rows.length) continue;
    snapshots.push(child);
    if (relation[0].deleteRule === 'CASCADE') await captureChildren(connection, snapshots, seen, depth + 1);
  }
}

async function beforeMutation(connection, statement, values) {
  const table = mutationTable(statement);
  if (!table || nonReversibleTables.has(table)) throw new Error('Operation cannot be reversed');
  const meta = await tableMetadata(connection, table);
  const plan = createUndoSqlPlan(statement, values, meta);
  const rows = await selectRows(connection, meta, plan.selector);
  const snapshots = [{ meta, rows }];
  if (plan.kind === 'delete') await captureChildren(connection, snapshots, new Set(rows.map(row => identity(meta, row))));
  return { plan, snapshots };
}

function snapshotChanges(meta, before, after) {
  const changes = [];
  const previous = new Map(before.map(row => [identity(meta, row), row]));
  const current = new Map(after.map(row => [identity(meta, row), row]));
  for (const key of new Set([...previous.keys(), ...current.keys()])) {
    const left = previous.get(key) || null;
    const right = current.get(key) || null;
    if (!isDeepStrictEqual(left, right)) changes.push({ key, meta, before: left, after: right });
  }
  return changes;
}

async function afterMutation(connection, capture, result) {
  const changes = [];
  for (const [index, snapshot] of capture.snapshots.entries()) {
    const { meta, rows: before } = snapshot;
    let after = [];
    if (before.length) {
      const keys = predicate(meta, before);
      after = await selectRows(connection, meta, keys.sql, keys.values);
    }
    if (index === 0 && capture.plan.kind === 'insert') {
      const inserted = await selectRows(connection, meta, capture.plan.selector);
      if (result.insertId && meta.primaryKey.length === 1) {
        inserted.push(...await selectRows(connection, meta, `${quoteIdentifier(meta.primaryKey[0])} = ?`, [result.insertId]));
      }
      const merged = new Map([...after, ...inserted].map(row => [identity(meta, row), row]));
      after = [...merged.values()];
    }
    changes.push(...snapshotChanges(meta, before, after));
  }
  if (JSON.stringify(changes).length > MAX_BYTES || changes.length > MAX_ROWS) throw new Error('Undo snapshot limit exceeded');
  return changes;
}

function append(journal, changes) {
  const size = JSON.stringify(changes).length;
  journal.bytes += size;
  if (journal.bytes > MAX_BYTES) journal.disabled = true;
  if (!journal.disabled) journal.groups.push(changes);
}

function wrapConnection(connection, journal) {
  let transaction = false;
  let staged = [];
  const mutate = async (method, args) => {
    const statement = typeof args[0] === 'string' ? args[0].trim() : '';
    if (journal.closed || journal.disabled || /^(SELECT|SHOW|EXPLAIN|DESCRIBE)\b/i.test(statement) || ignoredTables.has(mutationTable(statement))) return connection[method](...args);
    if (!mutationTable(statement)) { journal.disabled = true; return connection[method](...args); }
    let capture;
    const ownTransaction = !transaction;
    try {
      if (ownTransaction) await connection.beginTransaction();
      try { capture = await beforeMutation(connection, statement, args[1]); }
      catch { journal.disabled = true; }
      const result = await connection[method](...args);
      if (capture) {
        try {
          const changes = await afterMutation(connection, capture, result[0]);
          if (ownTransaction) append(journal, changes);
          else staged.push(changes);
        } catch { journal.disabled = true; }
      }
      if (ownTransaction) await connection.commit();
      return result;
    } catch (error) {
      journal.disabled = true;
      if (ownTransaction) await connection.rollback();
      throw error;
    }
  };
  return new Proxy(connection, { get(target, key) {
    if (key === 'query' || key === 'execute') return (...args) => mutate(key, args);
    if (key === 'beginTransaction') return async () => { await target.beginTransaction(); transaction = true; staged = []; };
    if (key === 'commit') return async () => { await target.commit(); staged.forEach(group => append(journal, group)); transaction = false; staged = []; };
    if (key === 'rollback') return async () => { await target.rollback(); transaction = false; staged = []; };
    if (key === 'release') return () => {
      if (transaction) journal.disabled = true;
      return target.release();
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

export function undoDatabase(pool) {
  const journal = undoContext.getStore();
  if (!journal || journal.closed || journal.disabled) return pool;
  return new Proxy(pool, { get(target, key) {
    if (key === 'getConnection') return async () => wrapConnection(await target.getConnection(), journal);
    if (key === 'query' || key === 'execute') return async (...args) => {
      const connection = wrapConnection(await target.getConnection(), journal);
      try { return await connection[key](...args); } finally { connection.release(); }
    };
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
}

export function finalChanges(groups) {
  const all = new Map();
  for (const changes of groups) for (const change of changes) {
    const previous = all.get(change.key);
    if (previous && !isDeepStrictEqual(previous.after, change.before)) throw new Error('Concurrent modification');
    all.set(change.key, previous ? { ...change, before: previous.before } : change);
  }
  return [...all.values()];
}

async function validateInsertedChildren(connection, final) {
  // Deleting a newly inserted parent must not cascade into someone else's new rows.
  const capturedKeys = new Set(final.map(change => change.key));
  for (const change of final.filter(change => !change.before && change.after)) {
    for (const relation of await references(connection, change.meta.table)) {
      const child = await childRows(connection, relation, [change.after]);
      if (child.rows.some(row => !capturedKeys.has(identity(child.meta, row)))) throw new Error('Concurrent child modification');
    }
  }
}

async function restoreChange(connection, change) {
  const table = quoteIdentifier(change.meta.table);
  const key = predicate(change.meta, [change.after || change.before]);
  if (!change.before) await connection.query(`DELETE FROM ${table} WHERE ${key.sql}`, key.values);
  else if (!change.after) await connection.query(`INSERT INTO ${table} SET ?`, [writableRow(change.meta, change.before)]);
  else {
    const previous = writableRow(change.meta, change.before);
    const versioned = typeof previous.revision === 'number';
    if (versioned) delete previous.revision;
    const revision = versioned ? ', `revision` = `revision` + 1' : '';
    await connection.query(`UPDATE ${table} SET ?${revision} WHERE ${key.sql}`, [previous, ...key.values]);
  }
}

export async function restoreJournal(connection, groups) {
  const final = finalChanges(groups);
  for (const change of final) {
    const key = predicate(change.meta, [change.after || change.before]);
    const rows = await selectRows(connection, change.meta, key.sql, key.values);
    if (!isDeepStrictEqual(rows[0] || null, change.after)) throw new Error('Concurrent modification');
  }
  await validateInsertedChildren(connection, final);
  for (const group of [...groups].reverse()) {
    // Parent rows were captured before their cascaded children.
    for (const change of group) {
      await restoreChange(connection, change);
    }
  }
}
