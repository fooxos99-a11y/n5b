import { useCallback, useEffect, useRef, useState } from 'react';
import {
  distanceInMeters,
  isStaffAttendanceLocationConfigured,
} from '../../shared/staff-attendance.js';
import {
  commitOfflineOperation,
  loadOfflineSnapshot,
  offlineActorKey,
} from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../shared/business-date.js';
import { offlineRecitationStore } from '@/services/offlineRecitationStore';
import { attendanceForDay, pendingAttendanceForDay } from '@/lib/staffAttendanceDay';
import useSaudiClock from '@/hooks/useSaudiClock';

const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const saudiDate = getBusinessDate;

const getCoordinates = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('تحديد الموقع غير متاح على هذا الجهاز.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Number(coords.accuracy || 0),
    }),
    () => reject(new Error('يجب السماح بالوصول للموقع لتسجيل التحضير.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

export default function useStaffAttendance(active = true) {
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(active);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const clock = useSaudiClock();
  const today = getBusinessDate(clock);
  const revision = useRef(0);
  const checkingIn = useRef(false);

  const refresh = useCallback(async () => {
    if (!active || checkingIn.current) return null;
    const requestRevision = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const accountId = getAccountId();
      if (!accountId) throw new Error('تعذر تحديد حساب مشرف المسار.');
      const record = await loadOfflineSnapshot(
        accountId,
        'staff-attendance:me',
        () => studentsApi.getMyStaffAttendance(),
      );
      const actions = await offlineRecitationStore.getActions(offlineActorKey(accountId), ['pending', 'failed', 'syncing']);
      const result = pendingAttendanceForDay(actions, today)
        ? { ...attendanceForDay(record, today), date: today, alreadyPresent: true, canAttend: false, status: 'pending_sync', pendingSync: true }
        : attendanceForDay(record, today);
      if (revision.current === requestRevision) setAttendance(result);
      return result;
    } catch (loadError) {
      if (revision.current === requestRevision) setError(loadError);
      return null;
    } finally {
      if (revision.current === requestRevision) setLoading(false);
    }
  }, [active, today]);

  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      ++revision.current;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);

  const checkIn = useCallback(async () => {
    if (checkingIn.current) return null;
    checkingIn.current = true;
    ++revision.current;
    setPending(true);
    setLoading(false);
    try {
      if (!attendance?.canAttend) throw new Error('التحضير غير متاح في هذا اليوم.');
      const accountId = getAccountId();
      if (!accountId) throw new Error('تعذر تحديد حساب مشرف المسار.');
      const policy = attendance?.offlinePolicy;
      const locationRequired = policy?.locationRequired === true
        || isStaffAttendanceLocationConfigured(policy?.targetLatitude, policy?.targetLongitude);
      if (!policy && navigator.onLine === false) {
        throw new Error('يلزم فتح التحضير مرة واحدة مع الإنترنت للتحقق من إعداداته.');
      }
      const coordinates = locationRequired ? await getCoordinates() : {};
      if (locationRequired) {
        const distance = distanceInMeters(
          { lat: coordinates.latitude, lng: coordinates.longitude },
          { lat: policy.targetLatitude, lng: policy.targetLongitude },
        );
        if (distance > Number(policy.radiusMeters || 0)) {
          throw new Error('لا يمكن تسجيل التحضير خارج نطاق الموقع المحدد.');
        }
      }
      if (navigator.onLine !== false) {
        const result = await studentsApi.checkInMyStaffAttendance(coordinates);
        setAttendance(result);
        window.dispatchEvent(new CustomEvent('nukhab-staff-attendance-updated', { detail: result }));
        await offlineRecitationStore.cacheSnapshot(
          `${offlineActorKey(accountId)}:resource:staff-attendance:me`, result,
        ).catch((cacheError) => setError(cacheError));
        return result;
      }
      await commitOfflineOperation(
        accountId,
        'staff_attendance',
        coordinates,
        { dedupeKey: `staff-attendance:${saudiDate()}` },
      );
      const result = {
        ...attendance,
        date: saudiDate(),
        alreadyPresent: true,
        canAttend: false,
        status: 'pending_sync',
        pendingSync: true,
      };
      setAttendance(result);
      window.dispatchEvent(new CustomEvent('nukhab-staff-attendance-updated', { detail: result }));
      return result;
    } finally {
      checkingIn.current = false;
      setPending(false);
    }
  }, [attendance]);

  useEffect(() => {
    const update = (event) => {
      ++revision.current;
      setAttendance(event.detail);
      setLoading(false);
    };
    window.addEventListener('nukhab-staff-attendance-updated', update);
    return () => window.removeEventListener('nukhab-staff-attendance-updated', update);
  }, []);

  const currentAttendance = attendanceForDay(attendance, today);
  return { attendance: currentAttendance, alreadyPresentToday: Boolean(currentAttendance?.alreadyPresent), loading, pending, error, refresh, checkIn };
}
