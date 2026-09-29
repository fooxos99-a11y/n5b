import express from 'express';
import { trimTrailingCharacter } from '../../shared/string-suffix.js';
import { db, getDatabaseContext } from '../db.js';
import {
  DASHBOARD_PERMISSION_KEYS,
  getSupervisorDashboardPermissions,
} from '../services/dashboardPermissions.js';
import {
  AUTH_SESSION_DAYS,
  createAuthSession,
} from '../services/authSessions.js';
import {
  clearLoginFailuresForIdentities,
  createLoginAttemptIdentities,
  getLoginAttemptBlockForIdentities,
  recordLoginFailures,
} from '../services/loginAttemptLimiter.js';
import {
  clearSessionCookie,
  isNativeApiRequest,
  setSessionCookie,
  TENANT_SESSION_COOKIE,
} from '../services/sessionCookies.js';

const router = express.Router();

async function createLoginPayload(req, res, role, user, payload = {}) {
  const token = await createAuthSession(role, user.id, user.name);
  if (role === 'student') {
    await db().query('UPDATE students SET last_login_at = NOW() WHERE id = ?', [user.id]);
  }
  setSessionCookie(req, res, TENANT_SESSION_COOKIE, token, AUTH_SESSION_DAYS);
  return {
    role,
    id: user.id,
    name: user.name,
    ...(isNativeApiRequest(req) ? { token } : {}),
    ...payload,
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const loginNumber = String(req.body.loginNumber || '').trim();
    const tenant = getDatabaseContext().tenant;
    const registrationNumber = String(tenant?.registrationNumber || '').trim();
    if (!loginNumber) {
      return res.status(422).json({ message: 'رقم الحساب مطلوب.' });
    }

    const nativeApiBase = trimTrailingCharacter(String(
      process.env.PLATFORM_PUBLIC_API_URL
      || process.env.PUBLIC_API_URL
      || `${req.protocol}://${req.get('host')}/api`,
    ), '/');
    const tenantPayload = {
      ...(isNativeApiRequest(req) ? { apiBase: nativeApiBase } : {}),
      complex: { registrationNumber, name: tenant?.name || '' },
    };
    const loginIdentities = createLoginAttemptIdentities({
      ip: req.ip,
      registrationNumber,
      loginNumber,
    });
    const attempt = await getLoginAttemptBlockForIdentities(db(), loginIdentities);
    if (attempt.blocked) {
      return res.status(429).json({ message: 'محاولات كثيرة. انتظر خمس دقائق ثم حاول مجددًا.' });
    }

    const [supervisors] = await db().query(
      // Reciter accounts were removed from the platform and can no longer sign in.
      "SELECT id, name, role FROM supervisors WHERE login_number = ? AND is_active = 1 AND role <> 'reciter' LIMIT 1",
      [loginNumber],
    );
    if (supervisors[0]?.role === 'manager') {
      await clearLoginFailuresForIdentities(db(), loginIdentities);
      return res.json(await createLoginPayload(req, res, 'manager', supervisors[0], {
        dashboardPermissions: DASHBOARD_PERMISSION_KEYS,
        ...tenantPayload,
      }));
    }
    if (supervisors[0]?.role === 'admin') {
      await clearLoginFailuresForIdentities(db(), loginIdentities);
      const dashboardPermissions = await getSupervisorDashboardPermissions(supervisors[0].id);
      return res.json(await createLoginPayload(req, res, 'admin', supervisors[0], {
        dashboardPermissions,
        ...tenantPayload,
      }));
    }

    const [students] = await db().query(
      'SELECT id, name FROM students WHERE login_number = ? LIMIT 1',
      [loginNumber],
    );
    if (students[0]) {
      await clearLoginFailuresForIdentities(db(), loginIdentities);
      return res.json(await createLoginPayload(req, res, 'student', students[0], tenantPayload));
    }

    if (supervisors[0]) {
      await clearLoginFailuresForIdentities(db(), loginIdentities);
      const dashboardPermissions = await getSupervisorDashboardPermissions(supervisors[0].id);
      return res.json(await createLoginPayload(req, res, 'supervisor', supervisors[0], {
        dashboardPermissions,
        ...tenantPayload,
      }));
    }

    await recordLoginFailures(db(), loginIdentities);
    return res.status(404).json({ message: 'رقم الحساب غير صحيح.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await db().query('DELETE FROM auth_sessions WHERE token_hash = ?', [req.auth.tokenHash]);
    clearSessionCookie(req, res, TENANT_SESSION_COOKIE);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
