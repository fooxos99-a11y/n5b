import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReportsSection from '../../src/components/dashboard/ReportsSection';
import { Toaster } from '../../src/components/ui/toaster';
import { studentsApi } from '../../src/services/studentsApi';
import { complexesApi } from '../../src/services/complexesApi';
import { STUDENT_LEVELS } from '../../shared/student-levels.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
if (localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id')) throw new Error('Use an isolated browser for synthetic statistics');
const complexes = [{id:1,name:'مجمع الفجر'},{id:2,name:'مجمع العصر'},{id:3,name:'مجمع فارغ'}];
complexesApi.list = async () => complexes;
const committees = Array.from({ length: 12 }, (_, index) => ({ id: index + 1,
  name: index === 0 ? 'الفجر' : index === 1 ? 'العصر' : `حلقة اختبار ${index + 1}`, complexId: index < 6 ? 1 : 2 }));
const students = committees.flatMap((committee, index) => Array.from({ length: 2 }, (_, offset) => ({
  id: index * 2 + offset + 1, name: `طالب ${committee.name} ${offset + 1}`, committeeId: committee.id, committeeName: committee.name,
  expectedWeeks: 2, attended: index ? 0 : 1, absent: index ? 1 : 0, grade: 50, max: 100, percentage: 50,
  segments: { tested: 1, grade: index ? 4 : 8, max: 10 },
  metrics: { attendance: { done: 8, total: 10 }, memorization: { done: 5, total: 10 }, mastery: { done: 4, total: 10 }, review: { done: 10, total: 10 }, link: { done: 0, total: 0 } },
})));
let reportRequested = () => {};
Object.assign(studentsApi, {
  getReportCommittees: async () => committees, getReportArchives: async () => [],
  getOverviewReport: async ({ from, to, committeeId, complexId }) => {
    reportRequested(`${from} إلى ${to} · المجمع ${complexId} · الحلقة ${committeeId}`);
    const selected = students.filter(student => (committeeId === 'all' || String(student.committeeId) === committeeId)
      && (complexId === 'all' || String(committees.find(committee => committee.id === student.committeeId)?.complexId) === complexId));
    const attended = selected.reduce((total, student) => total + student.attended, 0);
    return {
      period: { from, to }, totals: { familiesCount: selected.length, quranFaces: { memorization: selected.length * 5, mastery: selected.length * 4, review: selected.length * 10, link: 0 } },
      grades: { weeklyProgram: { percentage: selected.length ? 50 : 0, studentsList: selected },
        reading: { hizbs: selected.reduce((sum, student) => sum + student.id + 1, 0), byStudent: Object.fromEntries(selected.map(student => [student.id, { hizbs: student.id + 1 }])) },
        weeklySession: { expectedAttendance: selected.length * 2, attended, studentsList: selected },
        trackSession: { expectedAttendance: selected.length * 2, attended, studentsList: selected, segments: { grade: selected.reduce((sum, student) => sum + student.segments.grade, 0), max: selected.length * 10 } },
      },
      committeeIndicators: committees.filter(committee => selected.some(student => student.committeeId === committee.id)).map(committee => ({ ...committee, studentsCount: 1, students: selected.filter(student => student.committeeId === committee.id) })),
      studentLevels: selected.map(student => ({ ...student, level: STUDENT_LEVELS[0] })),
      bestStudents: selected.map(student => ({ ...student, grade: student.id * 10 + 0.5, complexName: complexes.find(complex => complex.id === committees.find(circle => circle.id === student.committeeId).complexId).name, percentage: student.percentage })).sort((a, b) => b.grade - a.grade),
      bestCommittees: committees.filter(circle => (committeeId === 'all' || String(circle.id) === committeeId) && (complexId === 'all' || String(circle.complexId) === complexId))
        .map(circle => ({ ...circle, complexName: complexes.find(complex => complex.id === circle.complexId).name, studentsCount: selected.filter(student => student.committeeId === circle.id).length, percentage: 50 })),
      bestComplexes: complexes.filter(complex => (complexId === 'all' || String(complex.id) === complexId)
        && (committeeId === 'all' || committees.some(circle => String(circle.id) === committeeId && circle.complexId === complex.id)))
        .map(complex => ({ ...complex, committeesCount: committees.filter(circle => circle.complexId === complex.id && (committeeId === 'all' || String(circle.id) === committeeId)).length,
          studentsCount: selected.filter(student => committees.find(circle => circle.id === student.committeeId).complexId === complex.id).length, percentage: complex.id === 3 ? null : 50, max: complex.id === 3 ? 0 : 100 })),
      teachers: selected.length ? [
        { id: 1, name: 'عبد الله بن عبد الرحمن مشرف المسارات', committees: 'الفجر، العصر، حلقة اختبار ذات اسم طويل',
          attendance: { attended: 4, late: 1, absent: 1, expected: 5, percentage: 80 }, achievement: { grade: 45, max: 60, percentage: 75 } },
        { id: 2, name: 'مشرف الاختبار الثاني', committees: 'العصر', attendance: { expected: 5, percentage: 0 }, achievement: { grade: 30, max: 60, percentage: 50 } },
        { id: 3, name: 'مشرف الاختبار الثالث', committees: '', attendance: { expected: 0, percentage: 0 }, achievement: { grade: 0, max: 0, percentage: 0 } },
      ] : [],
      planPerformance: {
        series: selected.length ? [{ date: from, done: selected.length * 8, expected: selected.length * 10, percentage: 80, shortageFaces: selected.length * 2 },
          { date: to, done: selected.reduce((sum,student) => sum + (student.id === 1 ? 8 : 10),0), expected: selected.length * 10,
            percentage: selected.reduce((sum,student) => sum + (student.id === 1 ? 80 : 100),0) / selected.length, shortageFaces: selected.some(student => student.id === 1) ? 2 : 0 }] : [],
        students: selected.map(student => ({ studentId: student.id, series: [{ date: from, done: 8, expected: 10, percentage: 80, shortageFaces: 2 }, { date: to, done: 10, expected: 10, percentage: 100, shortageFaces: 0 }] })),
      },
    };
  },
});
function Fixture() {
  const [range, setRange] = useState('');
  reportRequested = setRange;
  return <main className="mx-auto max-w-5xl p-3 sm:p-6" dir="rtl"><ReportsSection /><p className="mt-4 text-sm" aria-label="نطاق الطلب">{range}</p><Toaster /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
