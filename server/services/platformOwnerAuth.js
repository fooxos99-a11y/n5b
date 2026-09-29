import crypto from 'node:crypto';
import { siteName } from '../siteConfig.js';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEY_LENGTH = 64;

export function createPlatformOwnerSalt() {
  return crypto.randomBytes(24).toString('hex');
}

export async function hashPlatformOwnerPassword(password, salt) {
  return Buffer.from(
    await scrypt(String(password), String(salt), SCRYPT_KEY_LENGTH),
  ).toString('hex');
}

export async function verifyPlatformOwnerPassword(password, expectedHash, salt) {
  const storedHash = String(expectedHash || '');
  const storedSalt = String(salt || '');
  if (!storedHash || !storedSalt) return false;

  const actualHash = await hashPlatformOwnerPassword(password, storedSalt);
  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(storedHash, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getConfiguredPlatformOwner() {
  const username = String(
    process.env.PLATFORM_OWNER_REGISTRATION_NUMBER
    || process.env.PLATFORM_OWNER_USERNAME
    || '',
  ).trim();
  const password = String(
    process.env.PLATFORM_OWNER_LOGIN_NUMBER
    || process.env.PLATFORM_OWNER_PASSWORD
    || '',
  );
  const displayName = String(
    process.env.PLATFORM_OWNER_DISPLAY_NAME || `مالك ${siteName}`,
  ).trim();

  if (!username && !password) return null;
  if (!/^\d{3,32}$/.test(username) || password.length < 4 || password.length > 128) {
    throw new Error(
      'Platform owner credentials must use a 3-32 digit registration number and a 4-128 character login secret.',
    );
  }

  return {
    username,
    password,
    displayName: displayName || `مالك ${siteName}`,
  };
}
