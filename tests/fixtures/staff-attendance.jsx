import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StaffAttendancePrompt from '../../src/components/attendance/StaffAttendancePrompt';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
function Fixture() {
  const [checkedIn, setCheckedIn] = useState(false);
  return <StaffAttendancePrompt active attendanceState={{
    attendance: { date: '2026-09-23', canAttend: !checkedIn },
    loading: false,
    pending: false,
    checkIn: async () => setCheckedIn(true),
  }} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
