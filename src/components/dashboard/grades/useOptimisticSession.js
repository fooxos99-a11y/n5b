import { useState } from 'react';
import { evaluateTrackSession, evaluateWeeklySession } from '../../../../shared/grading-engine.js';

/** Keep the selected attendance visible while saving, and isolate it from week/circle navigation. */
export default function useOptimisticSession(week, committeeId, component) {
  const [pending, setPending] = useState(null);
  const scope = `${committeeId}:${week?.weekStart}:${component}`;
  const preview = pending?.scope === scope ? pending : null;
  const students = (week?.students || []).map(student => preview?.studentId === student.id
    ? { ...student, grade: { ...student.grade, [`${component}Detail`]: preview.detail, [`${component}Session`]: preview.detail } }
    : student);
  return {
    students,
    begin(student, payload) {
      const detail = component === 'track' ? evaluateTrackSession(week.policy, payload) : evaluateWeeklySession(week.policy, payload);
      setPending({ scope, studentId: student.id, detail });
    },
    clear() { setPending(current => current?.scope === scope ? null : current); },
  };
}
