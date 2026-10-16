import { randomBytes } from 'node:crypto';
import { hashStudentPassword, verifyStudentPassword } from './studentPassword.js';

const unavailablePasswordHash = hashStudentPassword(randomBytes(32).toString('hex'));

export async function verifyAccountPassword(account, password, database, environment = process.env) {
  if (account?.passwordHash) return verifyStudentPassword(password, account.passwordHash);

  const initialPassword = environment.MANAGER_PASSWORD;
  const canInitializeManager = account?.role === 'manager'
    && account.loginNumber === String(environment.MANAGER_LOGIN_NUMBER || '').trim()
    && typeof initialPassword === 'string' && initialPassword.length > 0 && initialPassword.length <= 256;
  if (!canInitializeManager) {
    await verifyStudentPassword(password, await unavailablePasswordHash);
    return false;
  }

  const initialHash = await hashStudentPassword(initialPassword);
  if (!await verifyStudentPassword(password, initialHash)) return false;

  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query(
      'SELECT password_hash AS passwordHash, role, is_active AS isActive FROM supervisors WHERE id = ? AND login_number = ? FOR UPDATE',
      [account.id, account.loginNumber],
    );
    if (!current || current.role !== 'manager' || !current.isActive) {
      await connection.rollback();
      return false;
    }
    if (current.passwordHash) {
      const valid = await verifyStudentPassword(password, current.passwordHash);
      await connection.commit();
      return valid;
    }

    await connection.query('UPDATE supervisors SET password_hash = ? WHERE id = ?', [initialHash, account.id]);
    // Sessions issued before the first password must never become valid again.
    await connection.query('DELETE FROM auth_sessions WHERE user_role = ? AND user_id = ?', ['manager', account.id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
