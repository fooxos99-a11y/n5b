import express from 'express';
import { db } from '../db.js';
import { isUuid } from '../../shared/offline-recitation.js';
import {
  STAFF_ATTENDANCE_RADIUS_METERS,
  distanceInMeters,
  isStaffAttendanceLocationConfigured,
  isStaffAttendanceRole,
  isStaffWorkDay,
} from '../../shared/staff-attendance.js';
import { getStaffAttendanceStatus } from '../services/prayerTimes.js';
import { resolveTrustedDeviceEventTime } from '../services/offlineRecitation.js';
import { getBusinessDateTimeParts } from '../../shared/business-date.js';

const saudiDateTimeParts = (value) => {
  const date = new Date(`${String(value || '').replace(' ', 'T')}Z`);
  return getBusinessDateTimeParts(date);
};

const publicRecord = (row, settings, date) => {
  const locationRequired = isStaffAttendanceLocationConfigured(
    settings.staffAttendanceLocationLat,
    settings.staffAttendanceLocationLng,
  );
  return ({
  enabled: settings.staffAttendanceSource === 'teacher',
  source: settings.staffAttendanceSource,
  date,
  workDays: settings.recitationSessionDays,
  alreadyPresent: ['present', 'late'].includes(row?.status),
  canAttend: settings.staffAttendanceSource === 'teacher' && isStaffWorkDay(date, settings.recitationSessionDays) && !['present', 'late'].includes(row?.status),
  status: row?.status || null,
  checkInTime: row?.checkInTime || null,
  distance: row?.distance === null || row?.distance === undefined ? null : Number(row.distance),
  offlinePolicy: settings.staffAttendanceSource === 'teacher' ? {
    locationRequired,
    targetLatitude: locationRequired ? Number(settings.staffAttendanceLocationLat) : null,
    targetLongitude: locationRequired ? Number(settings.staffAttendanceLocationLng) : null,
    radiusMeters: STAFF_ATTENDANCE_RADIUS_METERS,
  } : null,
  });
};

export function createStaffAttendanceRouter({ loadSettings, getNow }) {
  const router = express.Router();
  router.use((req, res, next) => isStaffAttendanceRole(req.auth?.role)
    ? next()
    : res.status(403).json({ message: 'التحضير متاح لمشرفي المسارات والإدارة فقط.' }));

  router.get('/me', async (req, res, next) => {
    try {
      const settings = await loadSettings();
      const { date } = getNow();
      const [[row]] = await db().query(
        `SELECT status, TIME_FORMAT(check_in_time, '%H:%i') AS checkInTime, distance_meters AS distance
         FROM supervisor_attendance_records WHERE supervisor_id = ? AND record_date = ? LIMIT 1`,
        [req.auth.id, date]
      );
      res.json(publicRecord(row, settings, date));
    } catch (error) { next(error); }
  });

  router.post('/me', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = await loadSettings();
      if (settings.staffAttendanceSource !== 'teacher') {
        return res.status(403).json({ message: 'التحضير مسجل عن طريق المشرف.' });
      }
      const locationRequired = isStaffAttendanceLocationConfigured(
        settings.staffAttendanceLocationLat,
        settings.staffAttendanceLocationLng,
      );
      let distance = null;
      if (locationRequired) {
        const latitude = Number(req.body?.latitude);
        const longitude = Number(req.body?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return res.status(422).json({ message: 'يجب السماح بالوصول للموقع لتسجيل التحضير.' });
        }
        distance = Math.round(distanceInMeters(
          { lat: latitude, lng: longitude },
          { lat: settings.staffAttendanceLocationLat, lng: settings.staffAttendanceLocationLng }
        ));
        if (distance > STAFF_ATTENDANCE_RADIUS_METERS) {
          return res.status(403).json({ message: 'لا يمكن تسجيل التحضير خارج نطاق الموقع المحدد.' });
        }
      }
      const offlineRequest = isUuid(req.body?.requestId) && isUuid(req.body?.deviceId);
      let event = null;
      if (offlineRequest) {
        event = await resolveTrustedDeviceEventTime(connection, {
          deviceId: String(req.body.deviceId).toLowerCase(),
          bootId: String(req.body.bootId || '').toLowerCase(),
          eventMonotonicMs: req.body.eventMonotonicMs,
          committedAtLocal: req.body.committedAtLocal,
          actorRole: req.auth.role,
          actorId: req.auth.id,
        });
        if (!event.trusted) {
          return res.status(409).json({ code: 'UNTRUSTED_OFFLINE_TIME', message: 'تعذر التحقق من وقت التحضير المحلي.' });
        }
      }
      const { date, time } = event ? saudiDateTimeParts(event.eventAt) : getNow();
      if (!isStaffWorkDay(date, settings.recitationSessionDays)) return res.status(422).json({ message: 'لا يوجد تحضير في هذا اليوم.' });
      const { status, asrTime } = getStaffAttendanceStatus(date, time, settings.staffAttendanceLateAfterAsrMinutes);
      await connection.beginTransaction();
      const [[previous]] = await connection.query(
        'SELECT status FROM supervisor_attendance_records WHERE supervisor_id = ? AND record_date = ? FOR UPDATE',
        [req.auth.id, date]
      );
      if (['present', 'late'].includes(previous?.status)) {
        await connection.rollback();
        return res.json({ ...publicRecord({ ...previous, checkInTime: time, distance }, settings, date), alreadyPresent: true });
      }
      await connection.query(
        `INSERT INTO supervisor_attendance_records
          (supervisor_id, record_date, status, check_in_time, points, check_in_method, distance_meters, asr_time)
         VALUES (?, ?, ?, ?, 0, 'self', ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), check_in_time = VALUES(check_in_time), points = 0,
          check_in_method = 'self', distance_meters = VALUES(distance_meters), asr_time = VALUES(asr_time)`,
        [req.auth.id, date, status, time, distance, asrTime]
      );
      await connection.commit();
      res.json(publicRecord({ status, checkInTime: time, distance }, settings, date));
    } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
  });

  return router;
}
