import * as Location from 'expo-location';
import { createAttendanceLocation, type AttendanceCoordinates } from '../domain/attendanceLocation';

export const getAttendanceCoordinates = createAttendanceLocation({
  permissions: async () => (await Location.requestForegroundPermissionsAsync()).granted,
  enabled: () => Location.hasServicesEnabledAsync(),
  position: () => new Promise<AttendanceCoordinates>((resolve, reject) => {
    let subscription: Location.LocationSubscription | null = null; let settled = false;
    const finish = (position?: AttendanceCoordinates) => {
      if (settled) return; settled = true; clearTimeout(timer); subscription?.remove();
      if (position) resolve(position); else reject(new Error('location-unavailable'));
    };
    const timer = setTimeout(() => finish(), 25_000);
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1_000, distanceInterval: 0 },
      position => finish({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => finish())
      .then(current => { subscription = current; if (settled) current.remove(); })
      .catch(() => finish());
  }),
});
