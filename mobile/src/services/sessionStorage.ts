import * as SecureStore from 'expo-secure-store';
import { NativeApiError } from './nativeApi';
import { parseStoredNativeSession, type SessionStorage } from '../domain/nativeSession';

const KEY = 'sa.nukhab.app.auth.session.v1';
const OPTIONS = { keychainService: 'sa.nukhab.app.auth.session',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export function createSessionStorage(): SessionStorage {
  async function available() {
    if (!await SecureStore.isAvailableAsync()) throw new NativeApiError('storage');
  }
  return {
    load: async () => {
      try {
        await available();
        const value = await SecureStore.getItemAsync(KEY, OPTIONS);
        if (!value) return null;
        return parseStoredNativeSession(JSON.parse(value));
      } catch { throw new NativeApiError('storage'); }
    },
    save: async session => {
      try { await available(); await SecureStore.setItemAsync(KEY, JSON.stringify(parseStoredNativeSession(session)), OPTIONS); }
      catch { throw new NativeApiError('storage'); }
    },
    clear: async () => {
      try { await available(); await SecureStore.deleteItemAsync(KEY, OPTIONS); }
      catch { throw new NativeApiError('storage'); }
    },
  };
}
