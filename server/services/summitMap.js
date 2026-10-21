import { normalizeSummitMapConfig, getSummitActiveStation, getSummitMapEventLocations, getSummitMapTotalKilometers } from '../../shared/summit-map.js';
import { applyStudentPointDelta, logStudentPointTransaction } from './studentPoints.js';
import { getBusinessDate } from '../../shared/business-date.js';
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
export const MAP_SETTINGS_KEY = 'summitMapSettings';
export async function loadMapSettings(connection, { lock = false } = {}) {
  const [[row]] = await connection.query(`SELECT setting_value AS value FROM app_settings WHERE setting_key=?${lock ? ' FOR UPDATE' : ''}`, [MAP_SETTINGS_KEY]);
  const saved = row ? JSON.parse(row.value) : {};
  return { enabled: saved.enabled !== false, revision: Number(saved.revision || 0), mapConfig: normalizeSummitMapConfig(saved.mapConfig) };
}
export async function loadMapJourney(connection, studentId) {
  const settings = await loadMapSettings(connection);
  if (!settings.enabled) return { enabled: false };
  const [[student]] = await connection.query('SELECT points FROM students WHERE id=?', [studentId]);
  if (!student) throw fail('الطالب غير موجود.', 404);
  const config = settings.mapConfig, totalKilometers = getSummitMapTotalKilometers(config);
  const points = Math.min(totalKilometers, Math.max(0, Math.trunc(Number(student.points) || 0)));
  const activeStation = getSummitActiveStation(config);
  const [arrivals] = await connection.query('SELECT location_id AS id FROM student_summit_arrivals WHERE student_id=?', [studentId]);
  const [[progress]] = await connection.query('SELECT kilometers FROM student_summit_progress WHERE student_id=?', [studentId]);
  const stages = getSummitMapEventLocations(config).map(location => ({ ...location, key: location.id, points: location.kilometer,
    unlocked: points >= location.kilometer || activeStation?.id === location.id,
    completed: arrivals.some(item => item.id === location.id) }));
  return { ...settings, points, totalKilometers, activeStation,
    displayedKilometers: Math.min(Number(progress?.kilometers || 0), points),
    reachedSummit: config.goal.enabled && points >= totalKilometers, stages,
    nextStage: stages.find(stage => stage.points > points) || null };
}
export async function requireStation(connection, stationId, baseSettings) {
  const settings = await loadMapSettings(connection, { lock: true });
  const station = settings.mapConfig.stations.find(item => item.id === stationId);
  if (!settings.enabled || !baseSettings.pointsSystemEnabled) throw fail('الخريطة أو نظام النقاط غير مفعّل.');
  if (!station) throw fail('المحطة غير موجودة.', 404);
  if (station.id !== settings.mapConfig.activeStationId) throw fail('فعّل المحطة قبل تسجيل النقاط.');
  return station;
}
export async function saveStationPoints(connection, { station, grades, actor, settings }) {
  if (!Array.isArray(grades) || !grades.length || grades.length > 500
    || grades.some(item => !Number.isSafeInteger(item?.studentId) || item.studentId <= 0 || !Number.isSafeInteger(item.points) || item.points < 0 || item.points > station.rewardPoints)
    || new Set(grades.map(item => item.studentId)).size !== grades.length) throw fail('حدد الطلاب وأدخل نقاطًا صحيحة ضمن حد المحطة.');
  const result = [];
  for (const { studentId, points } of [...grades].sort((a, b) => a.studentId - b.studentId)) {
    const [[student]] = await connection.query('SELECT id,committee_id AS committeeId FROM students WHERE id=? FOR UPDATE', [studentId]);
    if (!student) throw fail('الطالب غير موجود.', 404);
    if (['supervisor', 'reciter'].includes(actor.role)) {
      const [[scope]] = await connection.query('SELECT 1 AS allowed FROM supervisor_committees WHERE supervisor_id=? AND committee_id=?', [actor.id, student.committeeId]);
      if (!scope) throw fail('يمكنك تسجيل نقاط طلاب حلقاتك فقط.', 403);
    }
    const [[previous]] = await connection.query('SELECT id,earned_points AS points FROM student_station_points WHERE student_id=? AND station_id=? FOR UPDATE', [studentId, station.id]);
    const [saved] = await connection.query(`INSERT INTO student_station_points(student_id,station_id,earned_points) VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE earned_points=VALUES(earned_points),completed_at=NOW()`, [studentId, station.id, points]);
    const delta = await applyStudentPointDelta(connection, studentId, points - Number(previous?.points || 0), settings);
    if (delta) await logStudentPointTransaction(connection, { studentId, supervisorId: actor.role === 'supervisor' ? actor.id : null,
      actorRole: actor.role, actorName: actor.name, type: delta > 0 ? 'increase' : 'deduction', points: Math.abs(delta),
      date: getBusinessDate(), reason: `محطة: ${station.name}`, sourceType: 'summit_station', sourceId: previous?.id || saved.insertId });
    result.push({ studentId, earnedPoints: points, awardedPoints: delta });
  }
  return { grades: result };
}
