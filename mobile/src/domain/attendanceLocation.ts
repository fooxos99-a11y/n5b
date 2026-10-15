export type AttendanceCoordinates = { latitude: number; longitude: number };
const locationMessages = {
  denied: 'اسمح بالوصول إلى الموقع أثناء استخدام التطبيق لتسجيل التحضير.',
  disabled: 'شغّل خدمات الموقع ثم أعد المحاولة.',
  unavailable: 'تعذّر تحديد موقعك. انتقل إلى مكان تتوفر فيه إشارة الموقع ثم أعد المحاولة.',
  invalid: 'تعذّر التحقق من الموقع. أعد المحاولة.',
};
export class AttendanceLocationError extends Error {
  constructor(readonly code: keyof typeof locationMessages) { super(locationMessages[code]); this.name = 'AttendanceLocationError'; }
}
export interface AttendanceLocationProvider {
  permissions(): Promise<boolean>;
  enabled(): Promise<boolean>;
  position(): Promise<AttendanceCoordinates>;
}
export function createAttendanceLocation(provider: AttendanceLocationProvider) {
  return async (): Promise<AttendanceCoordinates> => {
    if (!await provider.permissions()) throw new AttendanceLocationError('denied');
    if (!await provider.enabled()) throw new AttendanceLocationError('disabled');
    let position: AttendanceCoordinates;
    try { position = await provider.position(); }
    catch { throw new AttendanceLocationError('unavailable'); }
    if (!Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90
      || !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180) throw new AttendanceLocationError('invalid');
    return { latitude: position.latitude, longitude: position.longitude };
  };
}
