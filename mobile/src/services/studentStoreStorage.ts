import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import type { StoredStudentStore, StudentStoreStorage } from '../domain/storePurchaseQueue';
import { probeDatabaseDirectoryUri } from '../domain/probeDatabaseUri';
import { NativeApiError } from './nativeApi';

const KEY_NAME = 'sa.nukhab.app.store.key.v1';
const KEY_OPTIONS = { keychainService: 'sa.nukhab.app.store', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const DATABASE_NAME = 'nukhab-native-store-v1.db';
let opening: Promise<SQLite.SQLiteDatabase> | null = null;
let tail: Promise<unknown> = Promise.resolve();
class StoreChangeFailure extends Error {
  constructor(readonly reason: unknown) { super('Store state callback failed'); }
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!await SecureStore.isAvailableAsync()) throw new NativeApiError('storage');
  let key = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
  if (!key) {
    if (new File(probeDatabaseDirectoryUri(SQLite.defaultDatabaseDirectory), DATABASE_NAME).exists) throw new NativeApiError('storage');
    key = Array.from(await Crypto.getRandomBytesAsync(32), byte => byte.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, KEY_OPTIONS);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new NativeApiError('storage');
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
  try {
    // PRAGMA cannot bind parameters. Only the validated local hex key is inserted.
    await database.execAsync(`PRAGMA key = "x'${key}'"`);
    const cipher = await database.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new NativeApiError('storage');
    await database.execAsync('CREATE TABLE IF NOT EXISTS student_store_states (scope_key TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL)');
    return database;
  } catch (cause) {
    try { await database.closeAsync(); }
    catch { throw new NativeApiError('storage'); }
    throw cause;
  }
}
function serialized<T>(work: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const result = tail.then(async () => {
    if (!opening) { opening = open().catch(cause => { opening = null; throw cause; }); }
    try { return await work(await opening); }
    catch (cause) {
      if (cause instanceof StoreChangeFailure) throw cause.reason;
      throw new NativeApiError('storage');
    }
  });
  tail = result.then(() => undefined, () => undefined); return result;
}
export function createStudentStoreStorage(): StudentStoreStorage {
  const read = async (database: SQLite.SQLiteDatabase, scopeKey: string): Promise<unknown | null> => {
    const row = await database.getFirstAsync<{ payload: string }>('SELECT payload FROM student_store_states WHERE scope_key = ?', scopeKey);
    return row ? JSON.parse(row.payload) : null;
  };
  return {
    read: scopeKey => serialized(database => read(database, scopeKey)),
    update: (scopeKey, change) => serialized(async database => {
      let next: StoredStudentStore | null = null;
      // Exclusive transactions create an unkeyed handle in Expo SQLite. This
      // serialized private keyed connection keeps every read/write in one transaction.
      await database.withTransactionAsync(async () => {
        const current = await read(database, scopeKey);
        try { next = change(current); }
        catch (cause) { throw new StoreChangeFailure(cause); }
        await database.runAsync('INSERT INTO student_store_states (scope_key, payload) VALUES (?, ?) ON CONFLICT(scope_key) DO UPDATE SET payload = excluded.payload', scopeKey, JSON.stringify(next));
      });
      if (!next) throw new NativeApiError('storage'); return next;
    }),
  };
}
