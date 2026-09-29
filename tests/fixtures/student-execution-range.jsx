import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentTodayCard from '../../src/components/portal/home/StudentTodayCard';
import '../../src/index.css';
import '../../src/components/portal/home/student-home.css';
createRoot(document.getElementById('root')).render(<main className="student-home"><StudentTodayCard studentId="99" executionEnabled model={{ percent: 0, groups: [{ type: 'memorization' }] }} onRead={() => {}} /></main>);
