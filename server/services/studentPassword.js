import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function validateStudentPassword(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256) {
    throw Object.assign(new Error('كلمة المرور مطلوبة، وبحد أقصى 256 حرفًا.'), { status: 422, statusCode: 422 });
  }
  return value;
}

export async function hashStudentPassword(value) {
  const password = validateStudentPassword(value);
  const salt = randomBytes(24).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyStudentPassword(value, storedHash) {
  if (typeof value !== 'string' || !value.length || value.length > 256) return false;
  const [algorithm, salt, hash] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{48}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual = await scrypt(value, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
