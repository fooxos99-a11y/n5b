import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlatformOwnerSalt,
  getConfiguredPlatformOwner,
  hashPlatformOwnerPassword,
  verifyPlatformOwnerPassword,
} from '../server/services/platformOwnerAuth.js';

const ownerEnvironmentKeys = [
  'PLATFORM_OWNER_REGISTRATION_NUMBER',
  'PLATFORM_OWNER_USERNAME',
  'PLATFORM_OWNER_LOGIN_NUMBER',
  'PLATFORM_OWNER_PASSWORD',
  'PLATFORM_OWNER_DISPLAY_NAME',
];

function restoreEnvironment(snapshot) {
  for (const key of ownerEnvironmentKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test('platform owner passwords are salted, hashed, and compared safely', async () => {
  const salt = createPlatformOwnerSalt();
  const passwordHash = await hashPlatformOwnerPassword('secure-login-1483', salt);

  assert.ok(salt.length >= 32);
  assert.notEqual(passwordHash, 'secure-login-1483');
  assert.equal(await verifyPlatformOwnerPassword('secure-login-1483', passwordHash, salt), true);
  assert.equal(await verifyPlatformOwnerPassword('wrong-login', passwordHash, salt), false);
  assert.equal(await verifyPlatformOwnerPassword('secure-login-1483', '', salt), false);
});

test('platform owner is disabled unless explicitly configured', () => {
  const snapshot = Object.fromEntries(ownerEnvironmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of ownerEnvironmentKeys) delete process.env[key];
    assert.equal(getConfiguredPlatformOwner(), null);

    process.env.PLATFORM_OWNER_REGISTRATION_NUMBER = '1483';
    process.env.PLATFORM_OWNER_LOGIN_NUMBER = '1483';
    process.env.PLATFORM_OWNER_DISPLAY_NAME = 'مالك المنصة';
    assert.deepEqual(getConfiguredPlatformOwner(), {
      username: '1483',
      password: '1483',
      displayName: 'مالك المنصة',
    });

    process.env.PLATFORM_OWNER_REGISTRATION_NUMBER = 'owner';
    assert.throws(getConfiguredPlatformOwner, /3-32 digit registration number/);
  } finally {
    restoreEnvironment(snapshot);
  }
});
