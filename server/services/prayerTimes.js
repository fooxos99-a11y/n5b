const BURAIDAH = Object.freeze({ latitude: 26.331667, longitude: 43.971667, timezone: 3 });

const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (value) => value * 180 / Math.PI;

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
}

export function calculateBuraidahAsr(dateValue) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('تاريخ حساب صلاة العصر غير صحيح.');
  const gamma = (2 * Math.PI / 365) * (dayOfYear(date) - 1);
  const equationOfTime = 229.18 * (
    0.000075
    + (0.001868 * Math.cos(gamma))
    - (0.032077 * Math.sin(gamma))
    - (0.014615 * Math.cos(2 * gamma))
    - (0.040849 * Math.sin(2 * gamma))
  );
  const declination = (
    0.006918
    - (0.399912 * Math.cos(gamma))
    + (0.070257 * Math.sin(gamma))
    - (0.006758 * Math.cos(2 * gamma))
    + (0.000907 * Math.sin(2 * gamma))
    - (0.002697 * Math.cos(3 * gamma))
    + (0.00148 * Math.sin(3 * gamma))
  );
  const latitude = radians(BURAIDAH.latitude);
  const asrAltitude = Math.atan(1 / (1 + Math.tan(Math.abs(latitude - declination))));
  const hourAngle = degrees(Math.acos(
    (Math.sin(asrAltitude) - (Math.sin(latitude) * Math.sin(declination)))
    / (Math.cos(latitude) * Math.cos(declination))
  ));
  const solarNoon = 720 - (4 * BURAIDAH.longitude) - equationOfTime + (BURAIDAH.timezone * 60);
  const totalMinutes = Math.round(solarNoon + (hourAngle * 4));
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getStaffAttendanceStatus(date, checkInTime, lateAfterMinutes) {
  const asrTime = calculateBuraidahAsr(date);
  const toMinutes = (value) => {
    const [hours, minutes] = String(value).split(':').map(Number);
    return (hours * 60) + minutes;
  };
  const lateAtMinutes = toMinutes(asrTime) + Math.max(0, Number(lateAfterMinutes || 0));
  return {
    asrTime,
    status: toMinutes(checkInTime) > lateAtMinutes ? 'late' : 'present',
  };
}
