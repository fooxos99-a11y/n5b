import React from 'react';
import { createRoot } from 'react-dom/client';
import ReportsSection from '../../src/components/dashboard/ReportsSection';
import { Toaster } from '../../src/components/ui/toaster';
import { studentsApi } from '../../src/services/studentsApi';
import { complexesApi } from '../../src/services/complexesApi';
import { STUDENT_LEVELS } from '../../shared/student-levels.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
if (localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id')) throw new Error('Use an isolated browser for synthetic statistics');
const scenario = new URLSearchParams(location.search).get('scenario');
const state = { fail: false, pointCalls: 0, oldFinished: false };
window.statisticsFixture = state;
const students = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, name: `طالب تجريبي ${index + 1}`,
  committeeName: index < 5 ? 'الفجر' : 'العصر', expectedWeeks: 1, expectedSegments: 2,
  grade: index ? 0 : 20, max: 30, attended: index ? 0 : 1, absent: 0,
  segments: { tested: index ? 0 : 1, grade: index ? 0 : 10, max: index ? 0 : 10 },
}));
complexesApi.list = async () => [];
studentsApi.getReportCommittees = async () => [{ id: 1, name: 'الفجر' }, { id: 2, name: 'العصر' }];
studentsApi.getReportArchives = async () => [];
studentsApi.getOverviewReport = async ({ from, to }) => {
  if (state.fail) throw new Error('Synthetic connection failure');
  const empty = scenario === 'empty';
  return { generatedAt: '2026-09-24T09:30:00Z', period: { from, to },
    totals: { familiesCount: 2 }, grades: {
      weeklyProgram: { grade: 0, max: empty ? 0 : 50, percentage: empty ? null : 0, studentsList: [] },
      weeklySession: { expectedAttendance: empty ? 0 : 10, attended: empty ? 0 : 1, studentsList: empty ? [] : students },
      trackSession: { grade: empty ? 0 : 20, max: empty ? 0 : 300, studentsList: empty ? [] : students,
        expectedAttendance: empty ? 0 : 10, attended: empty ? 0 : 1,
        segments: { tested: empty ? 0 : 1, expected: empty ? 0 : 20, grade: empty ? 0 : 10, max: empty ? 0 : 10 } },
    }, committeeIndicators: ['الفجر', 'العصر'].map((name, index) => ({ id: index + 1, name,
      studentsCount: 5, students: students.filter(row => row.committeeName === name) })),
    studentLevels: students.map(student => ({ ...student, level: STUDENT_LEVELS[0] })), bestStudents: [], bestCommittees: [], bestComplexes: [], teachers: [],
  };
};
studentsApi.getTeacherPointsReport = async () => {
  const call = ++state.pointCalls;
  if (scenario === 'race' && call === 1) {
    await new Promise(resolve => { state.releaseOld = resolve; });
    state.oldFinished = true;
    return { rows: [{ type: 'increase', studentName: 'بيانات الفترة السابقة', points: 1 }] };
  }
  return { rows: Array.from({ length: 2 }, (_, index) => ({ type: 'increase', studentName: `بيانات الفترة الحالية ${index + 1}`, points: 2 })) };
};
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl p-3 sm:p-6"><ReportsSection canViewTeacherPoints /><Toaster /></main>);
