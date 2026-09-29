import { registerRecitationDevice } from './offlineRecitation.js';

export async function registerDeviceTransaction(connection, options, register = registerRecitationDevice) {
  await connection.beginTransaction();
  try {
    const anchor = await register(connection, options);
    await connection.commit();
    return anchor;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
