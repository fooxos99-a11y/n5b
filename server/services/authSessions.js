import crypto from 'node:crypto';
import { db } from '../db.js';
import { getSessionCookie, setSessionCookie, TENANT_SESSION_COOKIE } from './sessionCookies.js';

const configuredSessionDays = Number(process.env.AUTH_SESSION_DAYS || 400);
export const AUTH_SESSION_DAYS = Number.isFinite(configuredSessionDays)
  ? Math.min(400, Math.max(365, Math.floor(configuredSessionDays)))
  : 400;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findAuthSession(req) {
  const authorization = String(req.get('authorization') || '');
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : getSessionCookie(req, TENANT_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const [[session]] = await db().query(
    `
    SELECT user_role AS role, user_id AS id, user_name AS name
    FROM auth_sessions
    WHERE token_hash = ?
    LIMIT 1
    `,
    [tokenHash]
  );
  return session ? {
    ...session,
    id: session.id ? Number(session.id) : null,
    tokenHash,
  } : null;
}

export async function createAuthSession(role, userId, userName) {
  const token = crypto.randomBytes(32).toString('hex');
  await db().query(
    `
    INSERT INTO auth_sessions (token_hash, user_role, user_id, user_name, expires_at)
    VALUES (?, ?, ?, ?, NULL)
    `,
    [hashToken(token), role, userId || null, userName]
  );
  return token;
}

export async function limitActiveAuthSessionLifetimes() {
  await db().query('UPDATE auth_sessions SET expires_at = NULL WHERE expires_at IS NOT NULL');
}

export async function revokeAuthSessionsForUser(connection, roles, userId) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const cleanRoles = roleList.map((role) => String(role || '').trim()).filter(Boolean);
  if (!cleanRoles.length || !userId) return;

  await connection.query(
    `DELETE FROM auth_sessions WHERE user_id = ? AND user_role IN (${cleanRoles.map(() => '?').join(', ')})`,
    [userId, ...cleanRoles]
  );
}

export function createAuthenticateApiRequest({ isPublicApiRequest }) {
  return async function authenticateApiRequest(req, res, next) {
    try {
      if (isPublicApiRequest(req)) return next();
      const authorization = String(req.get('authorization') || '');
      const hasToken = authorization.startsWith('Bearer ')
        ? Boolean(authorization.slice(7).trim())
        : Boolean(getSessionCookie(req, TENANT_SESSION_COOKIE));
      if (!hasToken) return res.status(401).json({ message: 'سجل الدخول أولاً.' });
      const session = await findAuthSession(req);
      if (!session) return res.status(401).json({ message: 'انتهت جلسة الدخول. سجل الدخول من جديد.' });
      if (!authorization.startsWith('Bearer ')) {
        const cookieToken = getSessionCookie(req, TENANT_SESSION_COOKIE);
        if (cookieToken) setSessionCookie(req, res, TENANT_SESSION_COOKIE, cookieToken, AUTH_SESSION_DAYS);
      }
      req.auth = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function attachOptionalAuthSession(req, _res, next) {
  try {
    req.auth = await findAuthSession(req) || undefined;
    next();
  } catch (error) {
    next(error);
  }
}
