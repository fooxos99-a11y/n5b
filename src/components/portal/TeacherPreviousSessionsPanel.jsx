import React, { useEffect, useMemo, useState } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import TeacherStudentHistoryCard from '@/components/portal/TeacherStudentHistoryCard';
import TeacherCorrectionDialog from '@/components/portal/TeacherCorrectionDialog';
import TeacherSessionCard from '@/components/portal/TeacherSessionCard';
import '@/components/portal/home/student-home.css';
import { studentsApi } from '@/services/studentsApi';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { buildStudentSessionWeeks } from '@/lib/studentPlan';
import { getBusinessDate } from '../../../shared/business-date.js';
import '@/components/portal/student-plan.css';

export default function TeacherPreviousSessionsPanel() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [correction, setCorrection] = useState(null);
  const accountId = Number(localStorage.getItem('wajeh_supervisor_id') || 0);
  const weeks = useMemo(() => buildStudentSessionWeeks(rows), [rows]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const load = studentId
      ? loadOfflineSnapshot(accountId, `recitation-history:${studentId}`, () => studentsApi.getStudentRecitationHistory(studentId))
      : loadOfflineSnapshot(accountId, 'recitation-history:scoped-students', () => studentsApi.getReportStudents());
    load.then((result) => {
      if (!active) return;
      if (studentId) setRows(Array.isArray(result?.rows) ? result.rows : []);
      else setStudents(Array.isArray(result) ? result : []);
    }).catch((error_) => {
      if (active) setError(error_.message || 'تعذر تحميل الجلسات السابقة.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, studentId, retry]);

  return <div className="student-plan student-plan-history" dir="rtl">
    {error && !studentId && <div role="alert" className="student-plan-error"><span>{error}</span><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</Button></div>}
    {loading && !students.length ? <DashboardLoader /> : <div className="grid items-start gap-3">
      {students.map(student => { const _resolveConditional = () => {
                                   if (loading) {
                                     return <DashboardLoader />;
                                   }
                                   if (weeks.length > 0) {
                                     return weeks.flatMap(week => week.days).filter(day => day.date <= getBusinessDate()).map(day => <TeacherSessionCard key={`${studentId}:${day.date}`} day={day} studentName={student.name} supervisorId={accountId} onCorrect={sessionId => setCorrection({ rows: rows.filter(row => row.sessionId === sessionId), studentName: student.name })} />);
                                   }
                                   return !error && <p className="student-plan-empty">لا توجد جلسات تسميع سابقة.</p>;
                                 };
                                 return (<TeacherStudentHistoryCard key={student.id} student={student} expanded={studentId === String(student.id)} onToggle={() => {
        setRows([]); setError(''); setLoading(true); setStudentId(studentId === String(student.id) ? '' : String(student.id));
      }}>
        {error && <div role="alert" className="student-plan-error"><span>{error}</span><Button variant="outline" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</Button></div>}
        {_resolveConditional()}
      </TeacherStudentHistoryCard>); })}
      {!students.length && !error && <p className="student-plan-empty">لا يوجد طلاب في حلقاتك.</p>}
    </div>}
    {correction && <TeacherCorrectionDialog {...correction} supervisorId={accountId} onClose={() => setCorrection(null)} onSaved={() => { setCorrection(null); setRetry(value => value + 1); }} />}
  </div>;
}
