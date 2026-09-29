const STAFF_ATTENDANCE_ROLES = Object.freeze(['supervisor', 'reciter', 'admin']);
export const STAFF_ATTENDANCE_RADIUS_METERS = 150;
export const isStaffWorkDay = (date, days = [0, 1, 2, 3, 4]) => days.map(Number).includes(new Date(`${date}T00:00:00Z`).getUTCDay());

export const isStaffAttendanceRole = (role) => STAFF_ATTENDANCE_ROLES.includes(String(role || ''));

export const isStaffAttendanceLocationConfigured = (latitude, longitude) => (
  latitude !== null
  && latitude !== undefined
  && latitude !== ''
  && longitude !== null
  && longitude !== undefined
  && longitude !== ''
  && Number.isFinite(Number(latitude))
  && Number.isFinite(Number(longitude))
);

export const distanceInMeters = (from, to) => {
  const earthRadius = 6371000;
  const toRad = (degree) => degree * Math.PI / 180;
  const deltaLat = toRad(Number(to.lat) - Number(from.lat));
  const deltaLng = toRad(Number(to.lng) - Number(from.lng));
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(Number(from.lat))) * Math.cos(toRad(Number(to.lat))) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
