import { createMemoryStudentStoreStorage } from '../domain/storePurchaseQueue';

// Browser previews do not represent native SQLCipher or persistent device storage.
const memory = createMemoryStudentStoreStorage();
export function createStudentStoreStorage() { return memory; }
