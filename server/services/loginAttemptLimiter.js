import crypto from 'node:crypto';

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

const attemptKey = ({ ip, registrationNumber, loginNumber }) => crypto
  .createHash('sha256')
  .update([
    String(ip || 'unknown').trim(),
    String(registrationNumber || '').trim(),
    String(loginNumber || '').trim(),
  ].join('\u0000'))
  .digest('hex');

export function createLoginAttemptIdentities(identity) {
  const normalized = {
    ip: identity.ip,
    registrationNumber: identity.registrationNumber,
    loginNumber: identity.loginNumber,
  };
  return [
    normalized,
    {
      ...normalized,
      ip: 'account-wide',
    },
  ];
}

async function getLoginAttemptBlock(connection, identity) {
  const keyHash = attemptKey(identity);
  const [[row]] = await connection.query(
    `
    SELECT TIMESTAMPDIFF(SECOND, NOW(), blocked_until) AS remainingSeconds
    FROM login_attempts
    WHERE attempt_key = ?
      AND blocked_until > NOW()
    LIMIT 1
    `,
    [keyHash]
  );
  return {
    blocked: Number(row?.remainingSeconds || 0) > 0,
    remainingSeconds: Math.max(0, Number(row?.remainingSeconds || 0)),
  };
}

export async function getLoginAttemptBlockForIdentities(connection, identities) {
  const blocks = await Promise.all(
    identities.map((identity) => getLoginAttemptBlock(connection, identity)),
  );
  return blocks.reduce(
    (result, block) => ({
      blocked: result.blocked || block.blocked,
      remainingSeconds: Math.max(result.remainingSeconds, block.remainingSeconds),
    }),
    { blocked: false, remainingSeconds: 0 },
  );
}

async function recordLoginFailure(pool, identity) {
  const keyHash = attemptKey(identity);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[row]] = await connection.query(
      `
      SELECT
        failures,
        UNIX_TIMESTAMP(blocked_until) * 1000 AS blockedUntilMs,
        UNIX_TIMESTAMP(updated_at) * 1000 AS updatedAtMs
      FROM login_attempts
      WHERE attempt_key = ?
      FOR UPDATE
      `,
      [keyHash]
    );
    const now = Date.now();
    const blockedUntilMs = Number(row?.blockedUntilMs || 0);
    if (blockedUntilMs > now) {
      await connection.commit();
      return { blocked: true };
    }
    const isActiveWindow = Number(row?.updatedAtMs || 0) >= now - ATTEMPT_WINDOW_MS;
    const failures = (isActiveWindow ? Number(row?.failures || 0) : 0) + 1;
    const blocked = failures >= ATTEMPT_LIMIT;
    await connection.query(
      `
      INSERT INTO login_attempts (attempt_key, failures, blocked_until, updated_at)
      VALUES (?, ?, ${blocked ? 'DATE_ADD(NOW(), INTERVAL 5 MINUTE)' : 'NULL'}, NOW())
      ON DUPLICATE KEY UPDATE
        failures = VALUES(failures),
        blocked_until = VALUES(blocked_until),
        updated_at = NOW()
      `,
      [keyHash, failures]
    );
    await connection.query(
      'DELETE FROM login_attempts WHERE updated_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
    );
    await connection.commit();
    return { blocked };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function recordLoginFailures(pool, identities) {
  const results = [];
  for (const identity of identities) {
    results.push(await recordLoginFailure(pool, identity));
  }
  return results;
}

async function clearLoginFailures(connection, identity) {
  await connection.query('DELETE FROM login_attempts WHERE attempt_key = ?', [attemptKey(identity)]);
}

export async function clearLoginFailuresForIdentities(connection, identities) {
  await Promise.all(
    identities.map((identity) => clearLoginFailures(connection, identity)),
  );
}
