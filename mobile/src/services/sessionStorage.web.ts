import { parseStoredNativeSession, type SessionStorage, type StoredNativeSession } from '../domain/nativeSession';

// Browser previews retain credentials only in this controller's memory. No browser
// storage or cookie is written; reload always requires a new server login.
export function createSessionStorage(): SessionStorage {
  let session: StoredNativeSession | null = null;
  return {
    load: async () => session,
    save: async value => { session = parseStoredNativeSession(value); },
    clear: async () => { session = null; },
  };
}
