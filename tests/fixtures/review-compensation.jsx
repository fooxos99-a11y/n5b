import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CompensationDialog from '../../src/components/portal/CompensationDialog';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import CountOnlyEvaluationDialog from '../../src/components/portal/CountOnlyEvaluationDialog';
import { Button } from '../../src/components/ui/button';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const student = { studentId:3, studentName:'طالب الاختبار', attendanceStatus:'present', recitationFinished:true, hasCompensation:true };
const state = { ready:false, owed:2, pending:false, fail:false, requests:[] };
studentsApi.getQuranCompensations = async () => ({ review: {
  owed:state.owed, done:2-state.owed, sourceDate:'2026-10-08', label:'البقرة آية 1 إلى البقرة آية 20',
  pendingTaskIds:state.pending ? [12] : [], blocked:state.ready ? null : 'سمّع مراجعة اليوم كاملة أولًا، ثم ابدأ التعويض.',
} });
studentsApi.createQuranCompensation = async (_supervisorId, payload) => {
  state.requests.push(payload);
  if (state.fail) { state.fail = false; throw new Error('تعذر الاتصال. أعد المحاولة.'); }
  state.pending = true;
  return { taskIds:[12], existing:false };
};
window.reviewCompensationTest = state;
const items = [{ id:12, label:'تعويض المراجعة' }];
function Fixture() {
  const [open, setOpen] = useState(false), [reciting, setReciting] = useState(false);
  return <main className="p-3 [font-family:var(--font-ui)]">
    <Button onClick={() => { state.ready = true; }}>اعتماد مراجعة اليوم</Button>
    <Button onClick={() => { state.fail = true; }}>فشل الاتصال التالي</Button>
    <TeacherRecitationTaskList students={[student]} tasks={[]} onRecite={() => {}} onOpenCompensation={() => setOpen(true)} />
    <CompensationDialog open={open} onOpenChange={setOpen} supervisorId={7} student={student} date="2026-10-11"
      onRecite={async (_student, ids) => { state.taskIds = ids; setOpen(false); setReciting(true); }} />
    <CountOnlyEvaluationDialog open={reciting} onOpenChange={setReciting} title="تعويض المراجعة" items={items}
      onSubmit={({ itemCounts }) => { state.counts = itemCounts; state.owed -= 1; state.pending = false; setReciting(false); }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
