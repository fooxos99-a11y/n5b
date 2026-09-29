import { mergeEditableRecitationTasks } from '../lib/recitationTaskResults.js';
import { Capacitor } from '@capacitor/core';
import { getAccountDeviceId } from '../lib/recitationDeviceIdentity.js';
import {
  OFFLINE_RECITATION_DB_VERSION,
  canEditPendingRecitation,
  createUuid,
  normalizeRecitationSessionType,
  normalizeRecitationSession,
} from '../../shared/offline-recitation.js';

const DATABASE_NAME = 'nukhab_offline_recitation';
// Keep the physical name stable so IndexedDB upgrades never discard pending work.
const WEB_DATABASE_NAME = `${DATABASE_NAME}_v1`;
const CHANGE_EVENT = 'nukhab:offline-recitation-change';
const bootId = createUuid();

const json = (value) => JSON.stringify(value ?? null);
const parseJson = (value, fallback = null) => {
  try {
    return value === null || value === undefined || value === '' ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
};

const notifyChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

const openWebDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(WEB_DATABASE_NAME, OFFLINE_RECITATION_DB_VERSION);
  request.onerror = () => reject(request.error);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
    if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'key' });
    if (!database.objectStoreNames.contains('task_cache')) database.createObjectStore('task_cache', { keyPath: 'key' });
    if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'key' });
    if (!database.objectStoreNames.contains('actions')) database.createObjectStore('actions', { keyPath: 'actionId' });
    if (!database.objectStoreNames.contains('sessions')) {
      const sessions = database.createObjectStore('sessions', { keyPath: 'sessionId' });
      sessions.createIndex('actor_status', ['actorKey', 'status'], { unique: false });
      sessions.createIndex('student_date', ['studentId', 'sessionDate'], { unique: false });
      sessions.createIndex('actor_student_date_type', ['actorKey', 'studentId', 'sessionDate', 'sessionType'], { unique: false });
    } else {
      const sessions = request.transaction.objectStore('sessions');
      if (!sessions.indexNames.contains('actor_student_date_type')) {
        sessions.createIndex('actor_student_date_type', ['actorKey', 'studentId', 'sessionDate', 'sessionType'], { unique: false });
      }
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const idbRequest = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const idbTransactionDone = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('تعذر حفظ البيانات محليًا.'));
});

/** Plan identity of a session's tasks, so a changed plan starts a separate session. */
const recitationPlanKey = (tasks = []) => [...new Set((tasks || [])
  .map((task) => `${Number(task.planId || 0)}:${Math.max(1, Number(task.planVersion || 1))}`))]
  .sort()
  .join('|');

class OfflineRecitationStore {
  driver = null;
  connection = null;
  initializing = null;

  async init() {
    if (this.driver) return this;
    if (this.initializing !== null) return this.initializing;
    this.initializing = this.#initialize();
    try {
      await this.initializing;
      return this;
    } finally {
      this.initializing = null;
    }
  }

  async #initialize() {
    if (!Capacitor.isNativePlatform()) {
      this.connection = await openWebDatabase();
      this.driver = 'indexeddb';
      return;
    }
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const storedSecret = await sqlite.isSecretStored().catch(() => ({ result: false }));
    if (!storedSecret.result) await sqlite.setEncryptionSecret(createUuid());
    const connection = await sqlite.createConnection(
      DATABASE_NAME,
      true,
      'secret',
      OFFLINE_RECITATION_DB_VERSION,
      false,
    );
    await connection.open();
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS offline_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offline_snapshots (
        key TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offline_task_cache (
        key TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offline_drafts (
        key TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offline_recitation_sessions (
        session_id TEXT PRIMARY KEY NOT NULL,
        actor_key TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        session_date TEXT NOT NULL,
        session_type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_local TEXT NOT NULL,
        updated_at_local TEXT NOT NULL,
        next_retry_at TEXT,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS offline_sessions_actor_status
        ON offline_recitation_sessions(actor_key, status, session_date, created_at_local);
      CREATE INDEX IF NOT EXISTS offline_sessions_student_date
        ON offline_recitation_sessions(student_id, session_date);
      CREATE TABLE IF NOT EXISTS offline_actions (
        action_id TEXT PRIMARY KEY NOT NULL,
        actor_key TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_local TEXT NOT NULL,
        next_retry_at TEXT,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS offline_actions_actor_status
        ON offline_actions(actor_key, status, created_at_local);
    `);
    const sessionColumns = await connection.query('PRAGMA table_info(offline_recitation_sessions)');
    if (!(sessionColumns.values || []).some((column) => column.name === 'session_type')) {
      await connection.execute(
        "ALTER TABLE offline_recitation_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'general'",
      );
    }
    await connection.execute(`CREATE INDEX IF NOT EXISTS offline_sessions_actor_student_date_type
      ON offline_recitation_sessions(actor_key, student_id, session_date, session_type)`);
    this.connection = connection;
    this.driver = 'sqlite';
  }

  async getMeta(key, fallback = null) {
    await this.init();
    if (this.driver === 'sqlite') {
      const result = await this.connection.query('SELECT value_json AS value FROM offline_meta WHERE key = ?', [key]);
      return parseJson(result.values?.[0]?.value, fallback);
    }
    const transaction = this.connection.transaction('meta', 'readonly');
    const row = await idbRequest(transaction.objectStore('meta').get(key));
    return row?.value ?? fallback;
  }

  async setMeta(key, value) {
    await this.init();
    const updatedAt = new Date().toISOString();
    if (this.driver === 'sqlite') {
      await this.connection.run(
        `INSERT INTO offline_meta (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [key, json(value), updatedAt],
      );
    } else {
      const transaction = this.connection.transaction('meta', 'readwrite');
      transaction.objectStore('meta').put({ key, value, updatedAt });
      await idbTransactionDone(transaction);
    }
    notifyChange();
  }

  async getDeviceContext(actorKey) {
    const deviceId = await getAccountDeviceId(this, actorKey);
    return {
      deviceId,
      bootId,
      deviceEpochMs: Date.now(),
      monotonicMs: globalThis.performance?.now?.() ?? null,
    };
  }

  async cacheSnapshot(actorKey, payload) {
    await this.#putPayload('snapshots', 'offline_snapshots', actorKey, payload);
  }

  async getSnapshot(actorKey) {
    return this.#getPayload('snapshots', 'offline_snapshots', actorKey);
  }

  async cacheTask(actorKey, taskId, payload) {
    await this.#putPayload('task_cache', 'offline_task_cache', `${actorKey}:${taskId}`, payload);
  }

  async getTask(actorKey, taskId) {
    return this.#getPayload('task_cache', 'offline_task_cache', `${actorKey}:${taskId}`);
  }

  async saveDraft(actorKey, studentId, payload) {
    return this.#putPayload('drafts', 'offline_drafts', `${actorKey}:${studentId}`, payload);
  }

  async getDraft(actorKey, studentId) {
    return this.#getPayload('drafts', 'offline_drafts', `${actorKey}:${studentId}`);
  }

  async deleteDraft(actorKey, studentId) {
    await this.init();
    const key = `${actorKey}:${studentId}`;
    if (this.driver === 'sqlite') {
      await this.connection.run('DELETE FROM offline_drafts WHERE key = ?', [key]);
    } else {
      const transaction = this.connection.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').delete(key);
      await idbTransactionDone(transaction);
    }
    notifyChange();
  }

  async commitSession(actorKey, value) {
    await this.init();
    const now = new Date().toISOString();
    const sessionType = normalizeRecitationSessionType(value.sessionType);
    // A session recited under an earlier plan (or plan version) does not block the new plan's session.
    const existing = (await this.getSessions(actorKey)).find((row) => (
      Number(row.studentId) === Number(value.studentId)
      && row.sessionDate === value.sessionDate
      && normalizeRecitationSessionType(row.sessionType) === sessionType
      && recitationPlanKey(row.tasks) === recitationPlanKey(value.tasks)
    ));
    if (existing && !canEditPendingRecitation(existing.status)) {
      throw new Error(existing.status === 'synced'
        ? 'تم تسميع الطالب اليوم بالفعل.'
        : 'جلسة الطالب قيد المزامنة أو تم حسمها مسبقًا.');
    }
    const session = normalizeRecitationSession({
      ...value,
      sessionType,
      sessionId: existing?.sessionId || value.sessionId,
      status: 'pending',
      tasks: mergeEditableRecitationTasks(existing, value.tasks),
      createdAtLocal: existing?.createdAtLocal || value.createdAtLocal || now,
      updatedAtLocal: now,
      committedAtLocal: existing?.committedAtLocal || value.committedAtLocal || now,
      bootId: existing?.bootId || bootId,
      eventMonotonicMs: existing?.eventMonotonicMs ?? globalThis.performance?.now?.() ?? null,
    });
    if (!session.sessionId || !session.studentId || !session.sessionDate || !session.tasks.length) {
      throw new Error('بيانات جلسة التسميع المحلية غير مكتملة.');
    }
    const row = { ...existing, ...session, actorKey, nextRetryAt: null, lastError: '' };
    if (this.driver === 'sqlite') {
      await this.connection.beginTransaction();
      try {
        await this.connection.run(
          `INSERT INTO offline_recitation_sessions
            (session_id, actor_key, student_id, session_date, session_type, status, payload_json,
             created_at_local, updated_at_local, next_retry_at, last_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(session_id) DO UPDATE SET status = excluded.status,
             payload_json = excluded.payload_json, updated_at_local = excluded.updated_at_local,
             next_retry_at = NULL, last_error = NULL`,
          [row.sessionId, actorKey, row.studentId, row.sessionDate, row.sessionType, row.status, json(row), row.createdAtLocal, row.updatedAtLocal],
          false,
        );
        await this.connection.run('DELETE FROM offline_drafts WHERE key = ?', [`${actorKey}:${row.studentId}`], false);
        await this.connection.commitTransaction();
      } catch (error) {
        await this.connection.rollbackTransaction().catch(() => undefined);
        throw error;
      }
    } else {
      const transaction = this.connection.transaction(['sessions', 'drafts'], 'readwrite');
      transaction.objectStore('sessions').put(row);
      transaction.objectStore('drafts').delete(`${actorKey}:${row.studentId}`);
      await idbTransactionDone(transaction);
    }
    notifyChange();
    return row;
  }

  async getSessions(actorKey, statuses = []) {
    await this.init();
    let rows;
    if (this.driver === 'sqlite') {
      const parameters = [actorKey];
      const statusFilter = statuses.length ? ` AND status IN (${statuses.map(() => '?').join(',')})` : '';
      parameters.push(...statuses);
      const result = await this.connection.query(
        `SELECT payload_json AS payload, status, next_retry_at AS nextRetryAt, last_error AS lastError
         FROM offline_recitation_sessions WHERE actor_key = ?${statusFilter}
         ORDER BY session_date, created_at_local`,
        parameters,
      );
      rows = (result.values || []).map((row) => ({
        ...parseJson(row.payload, {}),
        status: row.status,
        nextRetryAt: row.nextRetryAt,
        lastError: row.lastError,
      }));
    } else {
      const transaction = this.connection.transaction('sessions', 'readonly');
      rows = await idbRequest(transaction.objectStore('sessions').getAll());
      rows = rows.filter((row) => row.actorKey === actorKey && (!statuses.length || statuses.includes(row.status)));
      rows.sort((first, second) => `${first.sessionDate}:${first.createdAtLocal}`.localeCompare(`${second.sessionDate}:${second.createdAtLocal}`));
    }
    return rows.map((row) => row.tasks?.length && row.tasks.every((task) => task.taskType === 'memorization' && task.track === 'mastery')
      ? { ...row, sessionType: String(row.sessionType || '').replace(/^memorization/, 'mastery') }
      : row);
  }

  async updateSession(actorKey, sessionId, changes) {
    await this.init();
    const current = (await this.getSessions(actorKey)).find((row) => row.sessionId === sessionId);
    if (!current) return null;
    const next = { ...current, ...changes, updatedAtLocal: new Date().toISOString() };
    if (this.driver === 'sqlite') {
      await this.connection.run(
        `UPDATE offline_recitation_sessions SET status = ?, payload_json = ?, updated_at_local = ?,
           next_retry_at = ?, last_error = ? WHERE session_id = ? AND actor_key = ?`,
        [next.status, json(next), next.updatedAtLocal, next.nextRetryAt || null, next.lastError || null, sessionId, actorKey],
      );
    } else {
      const transaction = this.connection.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(next);
      await idbTransactionDone(transaction);
    }
    notifyChange();
    return next;
  }

  async getSummary(actorKey) {
    const sessions = await this.getSessions(actorKey);
    const actions = await this.getActions(actorKey);
    const snapshot = await this.getSnapshot(actorKey);
    const pendingStatuses = new Set(['pending', 'syncing', 'failed', 'invalid_sequence']);
    return {
      cachedStudents: Array.isArray(snapshot?.students) ? snapshot.students.length : 0,
      pending: sessions.filter((session) => pendingStatuses.has(session.status)).length
        + actions.filter((action) => pendingStatuses.has(action.status)).length,
      rejected: sessions.filter((session) => session.status.startsWith('rejected_') || session.status === 'conflict').length
        + actions.filter((action) => action.status.startsWith('rejected_') || action.status === 'conflict').length,
      lastSyncAt: await this.getMeta(`last_sync:${actorKey}`),
      preparedAt: await this.getMeta(`offline_prepared_at:${actorKey}`),
    };
  }

  async commitAction(actorKey, actionType, payload, { dedupeKey = '' } = {}) {
    await this.init();
    const existing = dedupeKey
      ? (await this.getActions(actorKey)).find((action) => (
        action.actionType === actionType
        && action.dedupeKey === dedupeKey
        && ['pending', 'failed', 'invalid_sequence'].includes(action.status)
      ))
      : null;
    if (existing) {
      return this.updateAction(actorKey, existing.actionId, {
        status: 'pending',
        payload: { ...payload, requestId: existing.actionId },
        nextRetryAt: null,
        lastError: '',
      });
    }
    const actionId = createUuid();
    const row = {
      actionId,
      actorKey,
      actionType,
      status: 'pending',
      dedupeKey,
      payload: { ...payload, requestId: actionId },
      createdAtLocal: new Date().toISOString(),
      nextRetryAt: null,
      lastError: '',
      retryCount: 0,
    };
    if (this.driver === 'sqlite') {
      await this.connection.run(
        `INSERT INTO offline_actions
          (action_id, actor_key, action_type, status, payload_json, created_at_local, next_retry_at, last_error)
         VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
        [row.actionId, actorKey, actionType, json(row), row.createdAtLocal],
      );
    } else {
      const transaction = this.connection.transaction('actions', 'readwrite');
      transaction.objectStore('actions').put(row);
      await idbTransactionDone(transaction);
    }
    notifyChange();
    return row;
  }

  async getActions(actorKey, statuses = []) {
    await this.init();
    if (this.driver === 'sqlite') {
      const parameters = [actorKey, ...statuses];
      const filter = statuses.length ? ` AND status IN (${statuses.map(() => '?').join(',')})` : '';
      const result = await this.connection.query(
        `SELECT payload_json AS payload, status, next_retry_at AS nextRetryAt, last_error AS lastError
         FROM offline_actions WHERE actor_key = ?${filter} ORDER BY created_at_local`,
        parameters,
      );
      return (result.values || []).map((row) => ({
        ...parseJson(row.payload, {}), status: row.status, nextRetryAt: row.nextRetryAt, lastError: row.lastError,
      }));
    }
    const transaction = this.connection.transaction('actions', 'readonly');
    const rows = await idbRequest(transaction.objectStore('actions').getAll());
    return rows
      .filter((row) => row.actorKey === actorKey && (!statuses.length || statuses.includes(row.status)))
      .sort((first, second) => first.createdAtLocal.localeCompare(second.createdAtLocal));
  }

  async updateAction(actorKey, actionId, changes) {
    const current = (await this.getActions(actorKey)).find((row) => row.actionId === actionId);
    if (!current) return null;
    const next = { ...current, ...changes };
    if (this.driver === 'sqlite') {
      await this.connection.run(
        `UPDATE offline_actions SET status = ?, payload_json = ?, next_retry_at = ?, last_error = ?
         WHERE action_id = ? AND actor_key = ?`,
        [next.status, json(next), next.nextRetryAt || null, next.lastError || null, actionId, actorKey],
      );
    } else {
      const transaction = this.connection.transaction('actions', 'readwrite');
      transaction.objectStore('actions').put(next);
      await idbTransactionDone(transaction);
    }
    notifyChange();
    return next;
  }

  async #putPayload(webStore, sqliteTable, key, payload) {
    await this.init();
    const cachedAt = new Date().toISOString();
    if (this.driver === 'sqlite') {
      await this.connection.run(
        `INSERT INTO ${sqliteTable} (key, payload_json, ${sqliteTable === 'offline_drafts' ? 'updated_at' : 'cached_at'})
         VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json,
         ${sqliteTable === 'offline_drafts' ? 'updated_at' : 'cached_at'} = excluded.${sqliteTable === 'offline_drafts' ? 'updated_at' : 'cached_at'}`,
        [key, json(payload), cachedAt],
      );
    } else {
      const transaction = this.connection.transaction(webStore, 'readwrite');
      transaction.objectStore(webStore).put({ key, payload, cachedAt, updatedAt: cachedAt });
      await idbTransactionDone(transaction);
    }
    notifyChange();
    return payload;
  }

  async #getPayload(webStore, sqliteTable, key) {
    await this.init();
    if (this.driver === 'sqlite') {
      const result = await this.connection.query(`SELECT payload_json AS payload FROM ${sqliteTable} WHERE key = ?`, [key]);
      return parseJson(result.values?.[0]?.payload, null);
    }
    const transaction = this.connection.transaction(webStore, 'readonly');
    const row = await idbRequest(transaction.objectStore(webStore).get(key));
    return row?.payload ?? null;
  }
}

export const offlineRecitationStore = new OfflineRecitationStore();
export const offlineRecitationChangeEvent = CHANGE_EVENT;
