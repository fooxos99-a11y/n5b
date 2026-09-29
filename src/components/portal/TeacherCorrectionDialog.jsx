import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import { studentsApi } from '@/services/studentsApi';
import { loadCachedTaskData } from '@/services/offlineRecitationService';
import { formatContinuousRecitationRange, sortRecitationTasks } from '@/lib/recitationTaskRanges';
const MushafRecitationDialog = lazy(() => import('@/components/portal/MushafRecitationDialog'));

export default function TeacherCorrectionDialog({ rows, supervisorId, studentName, onClose, onSaved }) {
  const [context, setContext] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState(false);
  const tasks = useMemo(() => sortRecitationTasks(rows.map(row => ({ ...row, id: row.taskId }))), [rows]);
  const items = useMemo(() => tasks.map(task => ({ ...task, label: formatContinuousRecitationRange([task]) })), [tasks]);
  const taskType = tasks[0]?.taskType;
  const mode = context?.evaluationModes?.[taskType] || 'mushaf';
  useEffect(() => {
    let active = true;
    studentsApi.getSupervisorQuranEvaluation(supervisorId).then(value => { if (active) setContext(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [supervisorId]);

  const save = async (results) => {
    setSaving(true); setError('');
    try {
      if (!navigator.onLine) throw new Error('اتصل بالإنترنت لتصحيح التقييم المعتمد.');
      const sessionId = crypto.randomUUID();
      const result = await studentsApi.syncOfflineRecitationBatch([{
        sessionId, studentId: tasks[0].studentId, sessionDate: rows[0].sessionDate,
        tasks: results.map(({ task, payload }) => ({ taskId: task.id, planId: task.planId,
          payload: { ...payload, correctionOf: rows[0].sessionId,
            repeatCount: task.actualRepeatCount, listeningCount: task.actualListeningCount } })),
      }]);
      const receipt = result.results?.[0];
      if (receipt?.result !== 'accepted') throw new Error(receipt?.tasks?.find(item => item.message)?.message || 'لم يُعتمد التصحيح. بقي التقييم السابق محفوظًا.');
      onSaved();
      return { results: receipt.tasks, pending: false };
    } catch (reason) { setError(reason.message); throw reason; }
    finally { setSaving(false); }
  };
  const failAction = <Button variant="outline" disabled={saving} onClick={() => setFailure(true)}>تسجيل راسب</Button>;
  if (!confirmed || failure) return <Dialog open onOpenChange={open => !open && !saving && onClose()}>
    <DialogContent dir="rtl"><DialogHeader><DialogTitle>{failure ? 'تأكيد الرسوب' : 'تصحيح التقييم'}</DialogTitle></DialogHeader>
      <p>{failure ? 'سيُسجّل المقدار راسبًا وتُحدّث الخطة والدرجة.' : 'سيحل التصحيح محل تقييمك السابق لجميع مقاطع الجلسة. يتاح لجلسة اليوم قبل اعتماد جلسة أحدث، ويُحفظ التقييم السابق في السجل.'}</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!context && !error && <DashboardLoader />}
      <div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={() => failure ? setFailure(false) : onClose()}>إلغاء</Button>
        <Button disabled={!context || saving} onClick={() => failure
          ? void save(tasks.map(task => ({ task, payload: { evaluationMode: mode, notMemorized: true } }))).catch(reason => setError(reason.message))
          : setConfirmed(true)}>{failure ? 'تأكيد الرسوب' : 'متابعة التصحيح'}</Button></div>
    </DialogContent>
  </Dialog>;
  if (mode === 'count') return <CountOnlyEvaluationDialog open onOpenChange={open => !open && !saving && onClose()}
    title={`تصحيح تسميع ${studentName}`} items={items} taskType={taskType} gradingPolicy={context.gradingPolicy}
    isSaving={saving} secondaryAction={failAction} onSubmit={({ itemCounts }) => void save(tasks.map(task => ({ task, payload: { evaluationMode: 'count', ...itemCounts[String(task.id)] } }))).catch(reason => setError(reason.message))}>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </CountOnlyEvaluationDialog>;
  return <Suspense fallback={<DashboardLoader />}><MushafRecitationDialog open supervisorId={supervisorId}
    student={{ studentId: tasks[0].studentId, studentName }} tasks={tasks} secondaryAction={failAction}
    onOpenChange={open => !open && !saving && onClose()} loadTaskData={task => loadCachedTaskData(supervisorId, task, { preferCache: false })}
    saveSessionResults={save} onSaved={() => undefined} /></Suspense>;
}
