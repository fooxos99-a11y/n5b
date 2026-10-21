import express from 'express';
import { requirePermission } from '../services/dashboardPermissions.js';
import { loadMapSettings, loadMapJourney, requireStation, saveStationPoints, MAP_SETTINGS_KEY } from '../services/summitMap.js';
import { validateSummitMapConfig, getSummitMapEventLocations, getSummitActiveStation, getSummitMapTotalKilometers } from '../../shared/summit-map.js';
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
export function createSummitRouter({ db, loadSettings }) {
  const router = express.Router();
  const student = (req, res, next) => req.auth?.role === 'student' ? next() : res.status(403).json({ message: 'الخريطة متاحة للطلاب فقط.' });
  const manage = requirePermission('settings');
  router.get('/settings', manage, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await loadMapSettings(db())); } catch (error) { next(error); }
  });
  router.put('/settings', manage, async (req, res, next) => {
    let connection;
    try {
      if (typeof req.body?.enabled !== 'boolean' || !Number.isSafeInteger(req.body.revision) || req.body.revision < 0) throw fail('بيانات إعدادات الخريطة غير مكتملة.');
      const mapConfig = validateSummitMapConfig(req.body.mapConfig);
      connection = await db().getConnection(); await connection.beginTransaction();
      const current = await loadMapSettings(connection, { lock: true });
      if (current.revision !== req.body.revision) throw fail('تغيّرت إعدادات الخريطة. أعد تحميلها قبل الحفظ.', 409);
      const value = { enabled: req.body.enabled, revision: current.revision + 1, mapConfig };
      await connection.query('UPDATE app_settings SET setting_value=? WHERE setting_key=?', [JSON.stringify(value), MAP_SETTINGS_KEY]);
      await connection.commit(); res.json(value);
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
  router.get('/stations/:id/grades', manage, async (req, res, next) => {
    let connection;
    try {
      connection = await db().getConnection(); await connection.beginTransaction();
      await requireStation(connection, req.params.id, await loadSettings());
      const scoped = ['supervisor', 'reciter'].includes(req.auth.role);
      const [students] = await connection.query(`SELECT s.id,s.name,s.committee_id AS committeeId,c.name AS committeeName,
        p.earned_points AS earnedPoints,p.completed_at AS completedAt FROM students s LEFT JOIN committees c ON c.id=s.committee_id
        LEFT JOIN student_station_points p ON p.student_id=s.id AND p.station_id=?
        ${scoped ? 'WHERE EXISTS(SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id=? AND sc.committee_id=s.committee_id)' : ''}
        ORDER BY s.name,s.id`, scoped ? [req.params.id, req.auth.id] : [req.params.id]);
      await connection.commit(); res.json({ students });
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
  router.put('/stations/:id/grades', manage, async (req, res, next) => {
    let connection;
    try {
      connection = await db().getConnection(); await connection.beginTransaction();
      const settings = await loadSettings(), station = await requireStation(connection, req.params.id, settings);
      const result = await saveStationPoints(connection, { station, grades: req.body?.grades, actor: req.auth, settings });
      await connection.commit(); res.json(result);
    } catch (error) { if (connection) await connection.rollback(); next(error); } finally { connection?.release(); }
  });
  router.get('/', student, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await loadMapJourney(db(), req.auth.id)); } catch (error) { next(error); }
  });
  router.put('/progress', student, async (req, res, next) => {
    try {
      if (!Number.isSafeInteger(req.body?.kilometers) || req.body.kilometers < 0) throw fail('مسافة الخريطة غير صحيحة.');
      const journey = await loadMapJourney(db(), req.auth.id);
      if (!journey.enabled) throw fail('الخريطة غير مفعّلة.', 404);
      if (req.body.kilometers > journey.points) throw fail('المسافة تتجاوز تقدمك الحالي.', 403);
      await db().query('INSERT INTO student_summit_progress(student_id,kilometers) VALUES(?,?) ON DUPLICATE KEY UPDATE kilometers=VALUES(kilometers)', [req.auth.id, req.body.kilometers]);
      res.json({ kilometers: req.body.kilometers });
    } catch (error) { next(error); }
  });
  router.post('/arrivals/:id', student, async (req, res, next) => {
    try {
      const settings = await loadMapSettings(db());
      if (!settings.enabled) throw fail('الخريطة غير مفعّلة.', 404);
      const stage = getSummitMapEventLocations(settings.mapConfig).find(item => item.id === req.params.id);
      if (!stage) throw fail('الموقع غير موجود.', 404);
      const [[row]] = await db().query('SELECT points FROM students WHERE id=?', [req.auth.id]);
      if (!row || (Number(row.points) < stage.kilometer && getSummitActiveStation(settings.mapConfig)?.id !== stage.id)) throw fail('لم تصل إلى هذا الموقع بعد.', 403);
      if (stage.kilometer > getSummitMapTotalKilometers(settings.mapConfig)) throw fail('الموقع خارج مسار الخريطة.');
      await db().query('INSERT IGNORE INTO student_summit_arrivals(student_id,location_id) VALUES(?,?)', [req.auth.id, stage.id]);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  return router;
}
