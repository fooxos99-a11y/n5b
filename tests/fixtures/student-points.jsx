import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentSessionWeek from '../../src/components/portal/home/StudentSessionWeek';
import '../../src/index.css';
import '../../src/components/portal/home/student-home.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const today = '2026-09-22';
const week = { start: '2026-09-20', end: '2026-09-26', days: [
  { date: today, points: { earned: 25, maximum: 75, maximumDetails: [{ label: 'الحفظ', maximum: 30, parts: [{ label: 'الحفظ', maximum: 20 }, { label: 'السماع', maximum: 5 }, { label: 'التكرار', maximum: 5 }] }, { label: 'المراجعة', maximum: 10 }, { label: 'الربط', maximum: 10 }, { label: 'الحضور', maximum: 25 }], details: [{ label: 'الحضور', earned: 25 }], additionalEarned: 150, additionalDetails: [{ label: 'حضور ثاني أيام البرنامج', earned: 150 }] },
    tasks: [{ id: 1, taskType: 'memorization', teacherCompleted: null, amountHidden: true }, { id: 2, taskType: 'review', teacherCompleted: false, amountHidden: true }] },
  { date: '2026-09-21', tasks: [{ id: 3, taskType: 'memorization', teacherCompleted: true, evaluatedAt: `${today} 18:18:09`, amountHidden: true }] },
] };
createRoot(document.getElementById('root')).render(<main className="student-home mx-auto max-w-3xl p-3"><StudentSessionWeek week={week} today={today} /></main>);
