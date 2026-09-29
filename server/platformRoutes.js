import crypto from 'node:crypto';
import { trimTrailingCharacter } from '../shared/string-suffix.js';
import express from 'express';
import { hashPlatformToken, platformDb } from './platformDb.js';
import { db, initDatabase, runWithDatabase } from './db.js';
import {
  clearLoginFailuresForIdentities,
  createLoginAttemptIdentities,
  getLoginAttemptBlockForIdentities,
  recordLoginFailures,
} from './services/loginAttemptLimiter.js';
import {
  createPlatformOwnerSalt,
  hashPlatformOwnerPassword,
  verifyPlatformOwnerPassword,
} from './services/platformOwnerAuth.js';
import {
  clearSessionCookie,
  getSessionCookie,
  isNativeApiRequest,
  PLATFORM_SESSION_COOKIE,
  setSessionCookie,
} from './services/sessionCookies.js';
import {
  aggregateAnalyticsRows,
  mapComplexesWithLimit,
  readComplexAnalytics,
  readComplexDetails,
  readComplexOverview,
  resolveAnalyticsPeriod,
  resolveOverviewPeriod,
} from './services/platformOverview.js';
import {
  readComplexPlatformSettings,
  writeComplexPlatformSettings,
} from './services/platformSettings.js';
import { siteName } from './siteConfig.js';

const router = express.Router();
const registrationPattern = /^\d{2,12}$/;
const loginNumberPattern = /^\d{1,80}$/;
const databaseNamePattern = /^\w+$/;

const normalizeText = (value, maxLength = 180) => String(value || '').trim().slice(0, maxLength);
const normalizeUrl = (value) => trimTrailingCharacter(String(value || '').trim(), '/');
async function requirePlatformOwner(req, res, next) {
  try {
    const authorization = String(req.get('authorization') || '');
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : getSessionCookie(req, PLATFORM_SESSION_COOKIE);
    if (!token) return res.status(401).json({ message: 'سجل دخول مالك المنصة أولاً.' });
    const [[owner]] = await platformDb().query(
      `
      SELECT o.id, o.username, o.display_name AS displayName
      FROM platform_owner_sessions s
      JOIN platform_owners o ON o.id = s.owner_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1
      `,
      [hashPlatformToken(token)],
    );
    if (!owner) return res.status(401).json({ message: 'انتهت جلسة مالك المنصة.' });
    req.platformOwner = owner;
    req.platformTokenHash = hashPlatformToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

router.get('/status', async (_req, res, next) => {
  try {
    const [[row]] = await platformDb().query('SELECT COUNT(*) AS count FROM platform_owners');
    res.json({
      name: siteName,
      ownerConfigured: Number(row.count || 0) > 0,
      setupAvailable: Boolean(process.env.PLATFORM_SETUP_TOKEN),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/setup', async (req, res, next) => {
  try {
    const setupToken = String(req.body.setupToken || '');
    const expectedToken = String(process.env.PLATFORM_SETUP_TOKEN || '');
    // Empty configured tokens must never authenticate an empty supplied token.
    if (expectedToken.length === 0 || setupToken.length !== expectedToken.length
      || !crypto.timingSafeEqual(Buffer.from(setupToken), Buffer.from(expectedToken))) {
      return res.status(403).json({ message: 'رمز إنشاء حساب المالك غير صحيح.' });
    }
    const [[row]] = await platformDb().query('SELECT COUNT(*) AS count FROM platform_owners');
    if (Number(row.count || 0) > 0) return res.status(409).json({ message: 'تم إنشاء حساب مالك المنصة مسبقًا.' });

    const username = normalizeText(req.body.username, 120);
    const displayName = normalizeText(req.body.displayName, 160);
    const password = String(req.body.password || '');
    if (username.length < 3 || displayName.length < 2 || password.length < 8) {
      return res.status(422).json({ message: 'أدخل اسمًا صحيحًا وكلمة مرور لا تقل عن 8 خانات.' });
    }
    const salt = createPlatformOwnerSalt();
    const passwordHash = await hashPlatformOwnerPassword(password, salt);
    await platformDb().query(
      'INSERT INTO platform_owners (username, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?)',
      [username, passwordHash, salt, displayName],
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const registrationNumber = normalizeText(req.body.registrationNumber, 32);
    const loginNumber = normalizeText(req.body.loginNumber, 80);
    const [[owner]] = await platformDb().query(
      `
      SELECT
        id,
        username,
        password_hash AS passwordHash,
        password_salt AS passwordSalt,
        display_name AS displayName
      FROM platform_owners
      WHERE username = ?
      LIMIT 1
      `,
      [registrationNumber],
    );
    if (!owner) {
      return res.status(404).json({ message: 'رقم المجمع أو رقم الدخول غير صحيح.' });
    }
    const loginIdentities = createLoginAttemptIdentities({
      ip: req.ip,
      registrationNumber: `platform-owner:${registrationNumber}`,
      loginNumber: registrationNumber,
    });
    const attempt = await getLoginAttemptBlockForIdentities(platformDb(), loginIdentities);
    if (attempt.blocked) {
      return res.status(429).json({ message: 'محاولات كثيرة. انتظر خمس دقائق ثم حاول مجددًا.' });
    }
    const validPassword = await verifyPlatformOwnerPassword(
      loginNumber,
      owner.passwordHash,
      owner.passwordSalt,
    );
    if (!validPassword) {
      await recordLoginFailures(platformDb(), loginIdentities);
      return res.status(404).json({ message: 'رقم المجمع أو رقم الدخول غير صحيح.' });
    }
    await clearLoginFailuresForIdentities(platformDb(), loginIdentities);
    const token = crypto.randomBytes(32).toString('hex');
    await platformDb().query('DELETE FROM platform_owner_sessions WHERE expires_at <= NOW()');
    await platformDb().query(
      'INSERT INTO platform_owner_sessions (owner_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
      [owner.id, hashPlatformToken(token)],
    );
    setSessionCookie(req, res, PLATFORM_SESSION_COOKIE, token, 30);
    res.json({
      ...(isNativeApiRequest(req) ? { token } : {}),
      owner: { id: owner.id, username: owner.username, displayName: owner.displayName },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requirePlatformOwner, async (req, res, next) => {
  try {
    await platformDb().query(
      'DELETE FROM platform_owner_sessions WHERE token_hash = ?',
      [req.platformTokenHash],
    );
    clearSessionCookie(req, res, PLATFORM_SESSION_COOKIE);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/complexes', requirePlatformOwner, async (_req, res, next) => {
  try {
    const [rows] = await platformDb().query(`
      SELECT
        id,
        registration_number AS registrationNumber,
        name,
        status,
        contact_name AS contactName,
        contact_phone AS contactPhone,
        manager_name AS managerName,
        manager_login_number AS managerLoginNumber,
        provisioning_error AS provisioningError,
        app_url AS appUrl,
        api_url AS apiUrl,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM platform_complexes
      ORDER BY CAST(registration_number AS UNSIGNED), name
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/overview', requirePlatformOwner, async (req, res, next) => {
  try {
    const period = resolveOverviewPeriod(req.query.days);
    const [complexes] = await platformDb().query(
      `
      SELECT
        id,
        registration_number AS registrationNumber,
        name,
        status,
        database_name AS databaseName
      FROM platform_complexes
      ORDER BY CAST(registration_number AS UNSIGNED), name
      `,
    );
    const rows = await mapComplexesWithLimit(complexes, async (complex) => ({
      id: complex.id,
      registrationNumber: complex.registrationNumber,
      name: complex.name,
      status: complex.status,
      ...(await readComplexOverview(complex, period)),
    }));
    const availableRows = rows.filter((row) => row.available);
    const totals = availableRows.reduce((summary, row) => {
      Object.entries(row.stats).forEach(([key, value]) => {
        if (!['attendanceRate', 'executionRate'].includes(key)) summary[key] += Number(value || 0);
      });
      return summary;
    }, {
      studentsCount: 0,
      committeesCount: 0,
      supervisorsCount: 0,
      recitersCount: 0,
      activeStudentsCount: 0,
      attendanceRecords: 0,
      attendedCount: 0,
      tasksCount: 0,
      tasksDone: 0,
      recitationsCount: 0,
      pointsTotal: 0,
      storeOrdersCount: 0,
      recentActivityCount: 0,
      activityCount: 0,
    });
    totals.attendanceRate = totals.attendanceRecords ? Math.round((totals.attendedCount / totals.attendanceRecords) * 100) : 0;
    totals.executionRate = totals.tasksCount ? Math.round((totals.tasksDone / totals.tasksCount) * 100) : 0;
    totals.complexesCount = rows.length;
    totals.activeComplexesCount = rows.filter((row) => row.status === 'active').length;
    totals.inactiveComplexesCount = rows.filter((row) => row.status !== 'active').length;
    res.json({ period, updatedAt: new Date().toISOString(), totals, complexes: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', requirePlatformOwner, async (req, res, next) => {
  try {
    const period = resolveAnalyticsPeriod(req.query);
    const requestedIds = String(req.query.complexIds || '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, 100);
    const whereClause = requestedIds.length ? `WHERE id IN (${requestedIds.map(() => '?').join(', ')})` : '';
    const [complexes] = await platformDb().query(
      `
      SELECT id, registration_number AS registrationNumber, name, status, database_name AS databaseName
      FROM platform_complexes
      ${whereClause}
      ORDER BY CAST(registration_number AS UNSIGNED), name
      `,
      requestedIds,
    );
    const scope = {
      committeeId: Number.isSafeInteger(Number(req.query.committeeId)) && Number(req.query.committeeId) > 0 ? Number(req.query.committeeId) : null,
      teacherId: Number.isSafeInteger(Number(req.query.teacherId)) && Number(req.query.teacherId) > 0 ? Number(req.query.teacherId) : null,
    };
    if ((scope.committeeId || scope.teacherId) && complexes.length !== 1) {
      return res.status(422).json({ message: 'فلترة الحلقة أو المعلم تتطلب اختيار مجمع واحد.' });
    }
    const rows = await mapComplexesWithLimit(complexes, async (complex) => ({
      id: complex.id,
      registrationNumber: complex.registrationNumber,
      name: complex.name,
      status: complex.status,
      ...(await readComplexAnalytics(complex, period, scope, complexes.length === 1)),
    }));
    const aggregate = aggregateAnalyticsRows(rows, period);
    const leaders = rows
      .filter((row) => row.available)
      .flatMap((row) => (row.trends?.leaders || []).map((leader) => ({ ...leader, complexId: row.id, complexName: row.name })))
      .sort((left, right) => right.achievedFaces - left.achievedFaces || String(left.name).localeCompare(String(right.name), 'ar'))
      .slice(0, 10);
    res.json({
      period: { from: period.from, to: period.to, days: period.days },
      previousPeriod: period.previous,
      updatedAt: new Date().toISOString(),
      unavailableMetrics: ['stoppedStudents', 'stage'],
      ...aggregate,
      leaders,
      filterOptions: rows.length === 1 ? rows[0].filterOptions : undefined,
      complexes: rows.map(({ trends: _trends, filterOptions: _filterOptions, ...row }) => row),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/settings/:complexId', requirePlatformOwner, async (req, res, next) => {
  try {
    const complexId = Number(req.params.complexId);
    if (!Number.isSafeInteger(complexId) || complexId < 1) {
      return res.status(422).json({ message: 'معرّف المجمع غير صحيح.' });
    }
    const [[complex]] = await platformDb().query(
      `SELECT id, registration_number AS registrationNumber, name, status, database_name AS databaseName
       FROM platform_complexes WHERE id = ? LIMIT 1`,
      [complexId],
    );
    if (!complex) return res.status(404).json({ message: 'المجمع غير موجود.' });
    const result = await readComplexPlatformSettings(complex);
    if (!result.available) return res.status(503).json({ message: 'تعذر قراءة إعدادات هذا المجمع.' });
    res.json({
      complex: { id: complex.id, name: complex.name },
      settings: result.settings,
      policies: result.policies,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', requirePlatformOwner, async (req, res, next) => {
  try {
    const requestedIds = Array.isArray(req.body.complexIds)
      ? [...new Set(req.body.complexIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100)
      : [];
    const whereClause = requestedIds.length ? `WHERE id IN (${requestedIds.map(() => '?').join(', ')})` : "WHERE status = 'active'";
    const [complexes] = await platformDb().query(
      `SELECT id, registration_number AS registrationNumber, name, status, database_name AS databaseName
       FROM platform_complexes ${whereClause} ORDER BY id`,
      requestedIds,
    );
    if (!complexes.length) return res.status(422).json({ message: 'اختر مجمعًا واحدًا على الأقل.' });
    const preflight = await mapComplexesWithLimit(complexes, async (complex) => ({
      id: complex.id,
      ...(await readComplexPlatformSettings(complex)),
    }));
    const unavailable = preflight.filter((item) => !item.available);
    if (unavailable.length) {
      return res.status(503).json({ message: 'تعذر الوصول إلى إعدادات بعض المجمعات.', complexIds: unavailable.map((item) => item.id) });
    }
    const results = await mapComplexesWithLimit(
      complexes,
      (complex) => writeComplexPlatformSettings(complex, {
        settings: req.body.settings,
        policies: req.body.policies,
      }),
    );
    const failed = results.map((result, index) => ({ result, complex: complexes[index] })).filter(({ result }) => !result.available);
    if (failed.length) {
      return res.status(503).json({ message: 'تعذر حفظ إعدادات بعض المجمعات.', complexIds: failed.map(({ complex }) => complex.id) });
    }
    res.json({
      ok: true,
      updatedComplexIds: complexes.map((complex) => complex.id),
      settings: results[0].settings,
      policies: results[0].policies,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/complexes/:id/overview', requirePlatformOwner, async (req, res, next) => {
  try {
    const complexId = Number(req.params.id);
    if (!Number.isSafeInteger(complexId) || complexId < 1) {
      return res.status(422).json({ message: 'معرّف المجمع غير صحيح.' });
    }
    const [[complex]] = await platformDb().query(
      `
      SELECT
        id,
        registration_number AS registrationNumber,
        name,
        status,
        database_name AS databaseName,
        contact_name AS contactName,
        contact_phone AS contactPhone,
        manager_name AS managerName,
        app_url AS appUrl,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM platform_complexes
      WHERE id = ?
      LIMIT 1
      `,
      [complexId],
    );
    if (!complex) return res.status(404).json({ message: 'المجمع غير موجود.' });
    const period = resolveOverviewPeriod(req.query.days);
    const details = await readComplexDetails(complex, period);
    const publicComplex = { ...complex };
    delete publicComplex.databaseName;
    res.json({ period, updatedAt: new Date().toISOString(), complex: publicComplex, ...details });
  } catch (error) {
    next(error);
  }
});

function normalizeComplexFields(body) {
  const registrationNumber = normalizeText(body.registrationNumber, 32);
  const name = normalizeText(body.name);
  const contactName = normalizeText(body.contactName) || null;
  const contactPhone = normalizeText(body.contactPhone, 40) || null;
  const managerName = normalizeText(body.managerName) || `مدير ${name}`;
  const managerLoginNumber = normalizeText(body.managerLoginNumber, 80);
  return { registrationNumber, name, contactName, contactPhone, managerName, managerLoginNumber };
}

router.post('/complexes', requirePlatformOwner, async (req, res, next) => {
  try {
    const { registrationNumber, name, contactName, contactPhone, managerName, managerLoginNumber } = normalizeComplexFields(req.body);
    if (!registrationPattern.test(registrationNumber) || name.length < 2 || !loginNumberPattern.test(managerLoginNumber)) {
      return res.status(422).json({ message: 'أدخل رقم تسجيل واسم مجمع ورقم دخول مدير صحيحًا.' });
    }
    const tenantDatabasePrefix = String(process.env.PLATFORM_TENANT_DATABASE_PREFIX || 'wajeh_tenant_');
    const databaseName = `${tenantDatabasePrefix}${registrationNumber}`;
    if (!databaseNamePattern.test(databaseName)) return res.status(422).json({ message: 'رقم التسجيل غير صحيح.' });
    const [result] = await platformDb().query(
      `
      INSERT INTO platform_complexes
        (registration_number, name, status, database_name, contact_name, contact_phone, manager_name, manager_login_number)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
      `,
      [registrationNumber, name, databaseName, contactName, contactPhone, managerName, managerLoginNumber],
    );
    try {
      await initDatabase(databaseName, { seedDefaultData: false });
      await runWithDatabase(databaseName, {
        tenant: { registrationNumber, name, databaseName },
      }, async () => {
        await db().query(
          `
          INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role)
          VALUES (?, ?, '', '', 'المدير', 'manager')
          ON DUPLICATE KEY UPDATE name = VALUES(name), job_title = 'المدير', role = 'manager'
          `,
          [managerName, managerLoginNumber],
        );
      });
      const publicApiUrl = normalizeUrl(
        process.env.PLATFORM_PUBLIC_API_URL
        || process.env.PUBLIC_API_URL
        || `${req.protocol}://${req.get('host')}/api`,
      );
      const publicAppUrl = normalizeUrl(
        process.env.PLATFORM_PUBLIC_APP_URL
        || process.env.PUBLIC_APP_URL
        || `${req.protocol}://${req.get('host')}`,
      );
      await platformDb().query(
        `
        UPDATE platform_complexes
        SET status = 'active', api_url = ?, app_url = ?, provisioning_error = NULL
        WHERE id = ?
        `,
        [publicApiUrl, publicAppUrl, result.insertId],
      );
      res.status(201).json({
        id: result.insertId,
        registrationNumber,
        name,
        status: 'active',
        contactName,
        contactPhone,
        managerName,
        managerLoginNumber,
        apiUrl: publicApiUrl,
        appUrl: publicAppUrl,
      });
    } catch (error) {
      await platformDb().query(
        'UPDATE platform_complexes SET provisioning_error = ? WHERE id = ?',
        [normalizeText(error.message, 500), result.insertId],
      );
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.put('/complexes/:id', requirePlatformOwner, async (req, res, next) => {
  let connection;
  try {
    const { registrationNumber, name, contactName, contactPhone, managerName, managerLoginNumber } = normalizeComplexFields(req.body);
    if (!registrationPattern.test(registrationNumber) || name.length < 2 || !loginNumberPattern.test(managerLoginNumber)) {
      return res.status(422).json({ message: 'أدخل رقم مجمع واسمًا ورقم دخول مدير صحيحًا.' });
    }

    connection = await platformDb().getConnection();
    await connection.beginTransaction();
    const [[complex]] = await connection.query(
      `
      SELECT id, database_name AS databaseName
      FROM platform_complexes
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [req.params.id],
    );
    if (!complex) {
      await connection.rollback();
      return res.status(404).json({ message: 'المجمع غير موجود.' });
    }
    if (!databaseNamePattern.test(String(complex.databaseName || ''))) {
      await connection.rollback();
      return res.status(409).json({ message: 'قاعدة بيانات المجمع غير جاهزة للتعديل.' });
    }

    const tenantDatabase = `\`${complex.databaseName}\``;
    const [[manager]] = await connection.query(
      `SELECT id FROM ${tenantDatabase}.supervisors WHERE role = 'manager' ORDER BY id LIMIT 1 FOR UPDATE`,
    );
    const managerId = Number(manager?.id || 0);
    const [loginConflicts] = await connection.query(
      `
      SELECT login_number
      FROM ${tenantDatabase}.supervisors
      WHERE login_number = ? AND id <> ?
      UNION ALL
      SELECT login_number
      FROM ${tenantDatabase}.students
      WHERE login_number = ?
      LIMIT 1
      `,
      [managerLoginNumber, managerId, managerLoginNumber],
    );
    if (loginConflicts.length) {
      const error = new Error('رقم دخول المدير مستخدم داخل المجمع.');
      error.code = 'MANAGER_LOGIN_DUPLICATE';
      throw error;
    }

    if (managerId) {
      await connection.query(
        `UPDATE ${tenantDatabase}.supervisors SET name = ?, login_number = ? WHERE id = ?`,
        [managerName, managerLoginNumber, managerId],
      );
    } else {
      await connection.query(
        `
        INSERT INTO ${tenantDatabase}.supervisors
          (name, login_number, national_id, phone, job_title, role)
        VALUES (?, ?, '', '', 'المدير', 'manager')
        `,
        [managerName, managerLoginNumber],
      );
    }
    await connection.query(
      `
      UPDATE platform_complexes
      SET registration_number = ?, name = ?, contact_name = ?, contact_phone = ?,
          manager_name = ?, manager_login_number = ?
      WHERE id = ?
      `,
      [registrationNumber, name, contactName, contactPhone, managerName, managerLoginNumber, req.params.id],
    );
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection?.rollback().catch(() => {});
    next(error);
  } finally {
    connection?.release();
  }
});

router.put('/complexes/:id/status', requirePlatformOwner, async (req, res, next) => {
  try {
    const status = ['active', 'inactive'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(422).json({ message: 'حالة المجمع غير صحيحة.' });
    const [[complex]] = await platformDb().query(
      'SELECT api_url AS apiUrl FROM platform_complexes WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!complex) return res.status(404).json({ message: 'المجمع غير موجود.' });
    if (status === 'active' && !normalizeUrl(complex.apiUrl)) {
      return res.status(409).json({ message: 'يجب تجهيز قاعدة وخدمة المجمع قبل تفعيله.' });
    }
    await platformDb().query('UPDATE platform_complexes SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ ok: true, status });
  } catch (error) {
    next(error);
  }
});

router.use((error, _req, res, next) => {
  if (error.code === 'MANAGER_LOGIN_DUPLICATE') {
    return res.status(409).json({ message: error.message });
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'رقم التسجيل مستخدم لمجمع آخر.' });
  }
  next(error);
});

export default router;
