import { getBusinessDate } from '../../shared/business-date.js';
import { isStaffWorkDay } from '../../shared/staff-attendance.js';

export const attendanceForDay = (record, date = getBusinessDate()) => {
  if (!record || record.date === date) return record;
  return {
    ...record,
    date,
    alreadyPresent: false,
    canAttend: record.enabled === true && isStaffWorkDay(date, record.workDays),
    status: null,
    checkInTime: null,
    pendingSync: false,
    distance: null,
  };
};

export const pendingAttendanceForDay = (actions, date) => actions.find((action) => (
  action.actionType === 'staff_attendance'
  && ['pending', 'failed', 'syncing'].includes(action.status)
  && action.dedupeKey === `staff-attendance:${date}`
));
