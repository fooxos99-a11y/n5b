import { useCallback, useState } from 'react';
import { gradingApi } from '@/services/gradingApi';
import useGradesRequest from './useGradesRequest';
import { committeeQuery, todayDate } from './gradesFormat';

/**
 * Loads one grading week of the selected circle and exposes week navigation.
 * A null weekStart asks the server for the current week.
 */
export default function useGradingWeek(committeeId) {
  const [weekStart, setWeekStart] = useState(null);
  const fetchWeek = useCallback(
    () => gradingApi.getWeek({ weekStart: weekStart || undefined, committeeId: committeeQuery(committeeId) }),
    [committeeId, weekStart],
  );
  const request = useGradesRequest(fetchWeek);
  const today = todayDate();
  const week = request.data;
  return {
    ...request,
    week,
    today,
    editable: Boolean(week?.weekStart) && week.weekStart <= today,
    setWeekStart,
  };
}
