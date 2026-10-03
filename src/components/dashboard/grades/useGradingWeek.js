import { useCallback, useEffect, useState } from 'react';
import { gradingApi } from '@/services/gradingApi';
import useGradesRequest from './useGradesRequest';
import { committeeQuery, todayDate } from './gradesFormat';

/**
 * Loads one grading week of the selected circle and exposes week navigation.
 * A null weekStart asks the server for the current week.
 */
export default function useGradingWeek(committeeId, component) {
  const [weekStart, setWeekStart] = useState(null);
  const fetchWeek = useCallback(
    () => gradingApi.getWeek({ component, weekStart: weekStart || undefined, committeeId: committeeQuery(committeeId) }),
    [committeeId, component, weekStart],
  );
  const request = useGradesRequest(fetchWeek);
  const { reload } = request;
  useEffect(() => {
    const refresh = () => { reload({ silent: true }).catch(() => undefined); };
    window.addEventListener('nukhab-grading-policy-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('nukhab-grading-policy-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [reload]);
  const today = todayDate();
  const week = request.data;
  return {
    ...request,
    week,
    today,
    editable: Boolean(week?.weekStart) && (week.periodStart || week.weekStart) <= today && !week.seasonalHoliday && Number(week.maxima?.total) !== 0,
    setWeekStart,
  };
}
