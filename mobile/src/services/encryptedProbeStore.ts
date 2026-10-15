import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ProbeStore, type DatabasePort } from '../domain/probeStore';
import { atProbeStage, ProbeFailure } from '../domain/probeFailure';
import { probeDatabaseDirectoryUri } from '../domain/probeDatabaseUri';

const KEY_NAME = 'sa.nukhab.app.native-probe.key.v1';
const KEY_OPTIONS = { keychainService: 'sa.nukhab.app.native-probe',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const databaseName = 'nukhab-native-probe-v1.db';

function port(database: SQLite.SQLiteDatabase): DatabasePort {
  return {
    exec: sql => database.execAsync(sql),
    run: async (sql, ...params) => { await database.runAsync(sql, ...params); },
    first: (sql, ...params) => database.getFirstAsync<{ payload: string }>(sql, ...params),
    // Exclusive transactions open an unkeyed connection in Expo SQLite. Keep the
    // transaction on this private keyed handle; the probe serializes its actions.
    transaction: work => database.withTransactionAsync(() => work(port(database))),
  };
}

export async function openEncryptedProbeStore() {
  if (!await atProbeStage('secure-store-availability', () => SecureStore.isAvailableAsync())) {
    throw new ProbeFailure('secure-store-availability', 'secure-store-unavailable');
  }
  let key = await atProbeStage('secure-store-read-key', () => SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS));
  if (!key) {
    if (await atProbeStage('database-file-check', () =>
      new File(probeDatabaseDirectoryUri(SQLite.defaultDatabaseDirectory), databaseName).exists)) {
      throw new ProbeFailure('database-file-check', 'missing-key');
    }
    const bytes = await atProbeStage('key-generation', () => Crypto.getRandomBytesAsync(32));
    const generatedKey = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    await atProbeStage('secure-store-write-key', () => SecureStore.setItemAsync(KEY_NAME, generatedKey, KEY_OPTIONS));
    key = generatedKey;
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ProbeFailure('key-validation', 'invalid-key');
  const database = await atProbeStage('database-open', () => SQLite.openDatabaseAsync(databaseName, { useNewConnection: true }));
  try {
    // PRAGMA does not support bind parameters; only a locally generated, validated hex key is used.
    await atProbeStage('database-key', () => database.execAsync(`PRAGMA key = "x'${key}'"`));
    const cipher = await atProbeStage('cipher-check', () => database.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version'));
    if (!cipher?.cipher_version) throw new ProbeFailure('cipher-check', 'cipher-unavailable');
    const store = new ProbeStore(port(database), { tenant: 'native-probe', account: 'synthetic-account' });
    await atProbeStage('database-initialize', () => store.initialize());
    async function verifyIsolation(operationId: string) {
      const isolatedAccounts = [
        new ProbeStore(port(database), { tenant: 'native-probe', account: 'other-synthetic-account' }),
        new ProbeStore(port(database), { tenant: 'other-native-probe', account: 'synthetic-account' }),
      ];
      for (const isolated of isolatedAccounts) {
        for (const kind of ['draft', 'session'] as const) {
          if (await atProbeStage('scope-isolation', () => isolated.restore(kind, operationId))) {
            throw new ProbeFailure('scope-isolation', 'scope-leak');
          }
        }
      }
    }
    return { store, verifyIsolation, close: () => atProbeStage('database-close', () => database.closeAsync()), cipherVersion: cipher.cipher_version };
  } catch (error) {
    try { await atProbeStage('database-close', () => database.closeAsync()); }
    catch { if (error instanceof ProbeFailure) error.cleanupFailed = true; }
    throw error;
  }
}
