import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import useTeacherEvaluationData from '../../src/hooks/useTeacherEvaluationData';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import RecitationDeliveryStatus from './RecitationDeliveryStatus';
import { Button } from '../../src/components/ui/button';
import { advanceRecitationTaskQueue } from '../../src/lib/recitationTaskQueue';
import { mergeRecitationDeliveryReceipts } from '../../src/lib/recitationDeliveryReceipts';
import { studentsApi } from '../../src/services/studentsApi';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const task = { id: 1, studentId: 8, studentName: 'طالب الاختبار', planId: 17, planVersion: 1, taskType: 'memorization',
  track: 'memorization', taskDate: '2026-09-08', attemptCount: 0,
  fromPage: 1, toPage: 1, fromSurah: 1, toSurah: 1, fromAyah: 1, toAyah: 7 };
const initial = { date: task.taskDate, tasks: [task], taskQueue: [task], students: [{ studentId: 8, studentName: task.studentName, attendanceStatus: 'present' }] };
const requests = [];
let sessions = JSON.parse(localStorage.getItem('acknowledgement-fixture-sessions') || '[]');
studentsApi.getSupervisorQuranEvaluation = () => new Promise(resolve => requests.push(resolve));
offlineRecitationStore.getSnapshot = async () => null;
offlineRecitationStore.getMeta = async () => null;
offlineRecitationStore.cacheSnapshot = async () => undefined;
offlineRecitationStore.getSessions = async () => sessions;
offlineRecitationStore.getActions = async () => [];
const loaded = () => {};

function Fixture() {
  const data = useTeacherEvaluationData(11, true, loaded);
  const [selected, setSelected] = useState(false);
  globalThis.acknowledgementFixture = {
    data, requests, initial,
    accept: () => {
      sessions = sessions.map(session => ({ ...session, status: 'synced', tasks: session.tasks.map(item => ({ ...item, synced: true, result: { ok: true, teacherCompleted: true, syncStatus: 'pending' } })) }));
      localStorage.setItem('acknowledgement-fixture-sessions', JSON.stringify(sessions));
    },
  };
  const finish = () => {
    sessions = [{ status: 'pending', studentId: 8, sessionDate: initial.date, tasks: [{ taskId: 1, planId: 17, planVersion: 1,
      taskDate: task.taskDate, taskType: task.taskType, payload: { offlineOutcome: { completed: true } } }] }];
    data.setData(current => ({ ...advanceRecitationTaskQueue(current, [task]), deliveryReceipts: mergeRecitationDeliveryReceipts(current, sessions) }));
    setSelected(false);
  };
  return <div className="space-y-3 p-3 [font-family:var(--font-ui)]" dir="rtl">
    <RecitationDeliveryStatus receipts={data.data?.deliveryReceipts} onRefresh={() => data.load({ fresh: true })} />
    <TeacherRecitationTaskList tasks={data.data?.tasks} taskQueue={data.data?.taskQueue} students={data.data?.students}
      isLoading={data.isLoading} onRecite={() => setSelected(true)} />
    {selected && <Button onClick={finish} className="min-h-11">إنهاء</Button>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
