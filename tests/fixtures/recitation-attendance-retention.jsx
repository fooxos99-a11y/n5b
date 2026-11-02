import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import { mergeCommittedOfflineEvaluation } from '../../src/lib/offlineEvaluationMerge';
import '../../src/index.css';

const savedTask = { id: 1, studentId: 8, taskType: 'memorization', track: 'memorization', planId: 3,
  taskDate: '2026-11-01', fromPage: 1, toPage: 1, fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7,
  targetPages: 1, teacherCompleted: true, evaluationScore: 97 };
const pendingTask = { ...savedTask, id: 2, studentId: 9, teacherCompleted: null, evaluationScore: null };
const base = { date: '2026-11-01', tasks: [savedTask, pendingTask], taskQueue: [savedTask, pendingTask],
  deliveryReceipts: [{ taskId: 1, studentId: 8, status: 'server_saved' }],
  students: [{ studentId: 8, studentName: 'طالب محفوظ', attendanceStatus: 'present', canSetAttendance: true, recitationFinished: true },
    { studentId: 9, studentName: 'طالب ينتظر التسميع', attendanceStatus: 'present', canSetAttendance: true }] };

function Fixture() {
  const [data, setData] = useState(base);
  const [actions, setActions] = useState([]);
  globalThis.attendanceRetentionFixture = { data, actions };
  const changeAttendance = (student, status) => {
    const next = [...actions, { status: 'pending', actionType: 'student_attendance',
      payload: { studentId: student.studentId, date: data.date, status } }];
    setActions(next);
    setData(mergeCommittedOfflineEvaluation(data, [], next));
  };
  return <main className="mx-auto max-w-5xl p-4" dir="rtl">
    <TeacherRecitationTaskList {...data} teacherAttendanceMode recitationAttendanceSource="teacher"
      onAttendanceChange={changeAttendance} onRecite={() => {}} showAmounts={false} />
  </main>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
