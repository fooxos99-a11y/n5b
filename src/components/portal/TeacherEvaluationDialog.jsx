import { commitOfflineOperation, syncOfflineActions, mergeOfflineReading } from '@/services/offlineOperationsService';
import { recitationErrorMessage } from '@/lib/recitationErrorMessage';
import { mergeRecitationDeliveryReceipts } from '@/lib/recitationDeliveryReceipts';
import { Button } from '@/components/ui/button';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import CompensationDialog from '@/components/portal/CompensationDialog';
import RecitationAmountsToggle from '@/components/portal/RecitationAmountsToggle';
import TeacherRecitationTaskList from '@/components/portal/TeacherRecitationTaskList';
import SelfReadingDialog from '@/components/portal/SelfReadingDialog';
import ErrorState from '@/components/ui/error-state';
import useTeacherEvaluationData from '@/hooks/useTeacherEvaluationData';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import {
  commitOfflineAttendance,
  commitOfflineRecitation,
  loadCachedTaskData,
  mergeLocalTeacherEvaluation,
  prefetchRecitationTasks,
  syncOfflineRecitations,
} from '@/services/offlineRecitationService';
import { sortRecitationTasks, formatContinuousRecitationRange } from '@/lib/recitationTaskRanges';
import { advanceRecitationTaskQueue, canAdvanceRecitationSession } from '@/lib/recitationTaskQueue';
import { evaluateLink, evaluateMemorization, evaluateReview } from '../../../shared/grading-engine.js';
import { canMarkRecitationFailed, RECITATION_FAILED_LABEL } from '../../../shared/recitation-fail.js';

const MushafRecitationDialog = lazy(() => import('@/components/portal/MushafRecitationDialog'));

const assertSessionAccepted = (session) => {
  if (!session || !['rejected_duplicate', 'rejected_permission', 'conflict', 'failed', 'invalid_sequence'].includes(session.status)) return;
  throw new Error(session.status === 'rejected_duplicate'
    ? 'لم يتم اعتماد هذا التقييم لأن الطالب تم تسميعه مسبقًا في نفس اليوم.'
    : (session.lastError || 'تعذر اعتماد هذا التسميع. بقي محفوظًا على الجهاز.'));
};

const evaluationTypeForTask = (task) => (
  task.taskType === 'memorization' && task.track === 'mastery' ? 'mastery' : task.taskType
);

/** Mirror the server row evaluation: memorization per one face, review per one hizb, link as one amount. */
const evaluateOfflineRecitation = (gradingPolicy, taskType, mistakes, warnings, hesitations) => {
  if (taskType === 'memorization') {
    const result = evaluateMemorization(gradingPolicy, { faces: [{ mistakes, warnings, hesitations }] });
    return { passed: !result.faces[0].failed, rawScore: result.faces[0].score };
  }
  if (taskType === 'review') {
    const result = evaluateReview(gradingPolicy, { hizbs: [{ mistakes, warnings, hesitations }] });
    return { passed: !result.hizbs[0].failed, rawScore: result.rawScore };
  }
  const result = evaluateLink(gradingPolicy, { mistakes, warnings, hesitations });
  return { passed: result.passed, rawScore: result.rawScore };
};

const offlineOutcome = (task, payload, gradingPolicy) => {
  if (!gradingPolicy) return null;
  const hesitationCount = Number(payload.hesitationCount ?? payload.wordMarks?.filter((mark) => mark.markType === 'hesitation').length ?? 0);
  const warningCount = Number(payload.warningCount ?? payload.wordMarks?.filter((mark) => mark.markType === 'warning').length ?? 0);
  const mistakeCount = Number(payload.mistakeCount ?? payload.wordMarks?.filter((mark) => isMistakeMark(mark.markType)).length ?? 0);
  const evaluatedFaces = Math.max(
    0.25,
    Number(task.targetPages || 0) || Math.abs(Number(task.toPage || 0) - Number(task.fromPage || 0)) + 1,
  );
  if (payload.notMemorized) {
    return { hesitationCount: 0, warningCount: 0, mistakeCount: 0, evaluatedFaces, score: 0, completed: false, notMemorized: true };
  }
  const { passed, rawScore } = evaluateOfflineRecitation(gradingPolicy, task.taskType, mistakeCount, warningCount, hesitationCount);
  const score = Math.max(0, Math.round(Number(rawScore) * 10000) / 100);
  return { hesitationCount, warningCount, mistakeCount, evaluatedFaces, score, completed: passed };
};

import { subscribeRecitationResume } from '@/lib/recitationResume';
import { isMistakeMark } from '../../../shared/recitation-mark-types.js';

const TeacherEvaluationDialog = ({ supervisorId, open = false, onOpenChange, inline = false }) => {
  const { toast } = useToast();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [compensationStudent, setCompensationStudent] = useState(null);
  const [isSavingCount, setIsSavingCount] = useState(false);
  const [confirmFailure, setConfirmFailure] = useState(false);
  const [attendancePendingIds, setAttendancePendingIds] = useState([]);
  const [showAmounts, setShowAmounts] = useState(false);
  const [readingStudent, setReadingStudent] = useState(null);
  const [isSavingReading, setIsSavingReading] = useState(false);
  const [quranChapters, setQuranChapters] = useState([]);
  const shouldLoad = inline || open;
  const onEvaluationLoaded = useCallback((evaluation) => {
    void prefetchRecitationTasks(supervisorId, evaluation.taskQueue || evaluation.tasks || [], { automatic: true, date: evaluation.date });
  }, [supervisorId]);
  const { data, setData, isLoading, loadError, retryAt, load } = useTeacherEvaluationData(
    supervisorId, shouldLoad, onEvaluationLoaded,
  );

  useEffect(() => {
    setShowAmounts(false);
  }, [shouldLoad, supervisorId]);

  useEffect(() => {
    if (!shouldLoad || quranChapters.length) return undefined;
    let active = true;
    studentsApi.getQuranChapters()
      .then((chapters) => {
        if (active && Array.isArray(chapters)) setQuranChapters(chapters);
      })
      .catch((error) => {
        if (active) toast({ title: 'تعذر تحميل أسماء السور', description: error.message, variant: 'destructive' });
      });
    return () => {
      active = false;
    };
  }, [quranChapters.length, shouldLoad, toast]);

  useEffect(() => {
    if (!shouldLoad) return undefined;
    return subscribeRecitationResume({
      windowTarget: window, documentTarget: document,
      isOnline: () => navigator.onLine !== false,
      refresh: () => { void load({ fresh: true }); },
    });
  }, [load, shouldLoad]);

  useEffect(() => {
    const updateModes = ({ detail }) => {
      if (!detail) return;
      setData((current) => current ? { ...current, evaluationModes: {
        ...current.evaluationModes,
        memorization: detail.memorizationMode,
        mastery: detail.memorizationMode,
        review: detail.reviewMode,
        link: detail.linkMode,
      } } : current);
    };
    window.addEventListener('nukhab-recitation-preferences-updated', updateModes);
    return () => window.removeEventListener('nukhab-recitation-preferences-updated', updateModes);
  }, [setData]);

  const updateAttendance = async (student, status) => {
    const studentId = Number(student.studentId);
    if (data?.recitationAttendanceSource !== 'teacher' || !student.canSetAttendance
      || !studentId || attendancePendingIds.includes(studentId)) return;
    setAttendancePendingIds((current) => [...current, studentId]);
    try {
      await commitOfflineAttendance({
        supervisorId,
        studentId,
        date: data?.date,
        status,
      });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          students: (current.students || []).map((item) => (
            Number(item.studentId) === studentId ? { ...item, attendanceStatus: status } : item
          )),
        };
      });
      if (navigator.onLine !== false) {
        await syncOfflineRecitations(supervisorId, { force: true });
        await load({ silent: true });
      }
    } catch (error) {
      toast({ title: 'تعذر حفظ الحضور محليًا', description: error.message, variant: 'destructive' });
    } finally {
      setAttendancePendingIds((current) => current.filter((id) => id !== studentId));
    }
  };

  const prepareRecitation = async (student) => {
    const selectStudent = (selection) => setSelectedStudent({
      ...selection,
      tasks: selection.tasks.map((task) => ({ ...task })),
      evaluationMode: data?.evaluationModes?.[evaluationTypeForTask(selection.tasks[0])] || 'mushaf',
    });
    const firstTask = student.tasks?.[0];
    const lastTask = student.tasks?.[student.tasks.length - 1];
    const taskExecutionSource = data?.executionSources?.[firstTask?.taskType] || 'teacher';
    const selectedEndMatchesTasks = student.actualEnd
      && Number(student.actualEnd.page) === Number(lastTask?.toPage)
      && Number(student.actualEnd.surah) === Number(lastTask?.toSurah)
      && Number(student.actualEnd.ayah) === Number(lastTask?.toAyah);
    if (navigator.onLine === false
      || !['teacher', 'both'].includes(taskExecutionSource)
      || !['memorization', 'review'].includes(firstTask?.taskType)
      || !student.actualEnd
      || selectedEndMatchesTasks) {
      selectStudent(student);
      return;
    }
    try {
      const prepared = await studentsApi.prepareSupervisorQuranRange(supervisorId, firstTask.id, {
        actualEnd: student.actualEnd,
        date: data?.date,
        taskIds: (student.tasks || []).map((task) => task.id),
      });
      const selectedIds = new Set((prepared.taskIds || []).map(Number));
      const refreshed = await studentsApi.getSupervisorQuranEvaluation(supervisorId);
      setData(await mergeLocalTeacherEvaluation(supervisorId, refreshed));
      selectStudent({
        ...student,
        tasks: sortRecitationTasks((refreshed.tasks || []).filter((task) => selectedIds.has(Number(task.id)))),
      });
    } catch (error) {
      toast({ title: 'تعذر تعديل مقدار التسميع', description: error.message, variant: 'destructive' });
    }
  };

  const openRecitation = (student) => {
    prepareRecitation(student);
  };

  // Persist reading before delivery so a lost connection cannot discard the teacher outcome.
  const saveReading = async ({ completed }) => {
    if (!readingStudent) return;
    setIsSavingReading(true);
    try {
      const action = await commitOfflineOperation(supervisorId, 'self_reading', {
        supervisorId, studentId: readingStudent.studentId, date: data?.date, completed,
        amount: readingEntry?.amount,
      }, { dedupeKey: `reading:${supervisorId}:${readingStudent.studentId}:${data?.date}` });
      setData(await mergeOfflineReading(supervisorId, data));
      if (navigator.onLine !== false) {
        const result = (await syncOfflineActions(supervisorId, { force: true })).find(item => item.actionId === action.actionId);
        if (result?.status?.startsWith('rejected_')) throw new Error(result.lastError);
      }
      setReadingStudent(null);
    } catch (error) {
      toast({ title: 'تعذر حفظ القراءة الذاتية', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingReading(false);
    }
  };
  const readingEntry = readingStudent
    ? (data?.reading || []).find((item) => Number(item.studentId) === Number(readingStudent.studentId)) || null
    : null;

  // A compensation is created as real tasks, then recited like any amount of the day.
  const reciteCompensation = async (student, taskIds) => {
    const selectedIds = new Set(taskIds.map(Number));
    const refreshed = await studentsApi.getSupervisorQuranEvaluation(supervisorId);
    setData(await mergeLocalTeacherEvaluation(supervisorId, refreshed));
    const tasks = sortRecitationTasks((refreshed.tasks || []).filter((task) => selectedIds.has(Number(task.id))));
    if (!tasks.length) throw new Error('لم يظهر التعويض في الجلسة، أعد فتحها.');
    setCompensationStudent(null);
    setSelectedStudent({
      ...student,
      tasks: tasks.map((task) => ({ ...task })),
      actualEnd: null,
      repeatCount: undefined,
      listeningCount: undefined,
      evaluationMode: data?.evaluationModes?.[evaluationTypeForTask(tasks[0])] || 'mushaf',
    });
  };

  const selectedTask = selectedStudent?.tasks?.[0];

  const selectedEvaluationMode = selectedStudent?.evaluationMode || 'mushaf';

  const markRecitationPending = useCallback((studentId, tasks, session) => {
    setData((current) => {
      if (!current) return current;
      const advanced = advanceRecitationTaskQueue(current, tasks, { promote: canAdvanceRecitationSession(session) });
      const remainingTasks = advanced.tasks || [];
      const hasRemainingTasks = remainingTasks.some((task) => Number(task.studentId) === Number(studentId));
      return {
        ...advanced,
        deliveryReceipts: mergeRecitationDeliveryReceipts(current, [session]),
        tasks: remainingTasks,
        students: (advanced.students || [])
          .map((student) => (
            Number(student.studentId) === Number(studentId)
              ? { ...student, recitationFinished: false, recitationPending: !hasRemainingTasks }
              : student
          )),
      };
    });
  }, [setData]);

  const syncRecitationInBackground = useCallback((sessionId) => {
    if (navigator.onLine === false) return;
    void syncOfflineRecitations(supervisorId, { force: true })
      .then((synced) => {
        const savedSession = synced.find((item) => item?.sessionId === sessionId);
        if (savedSession) assertSessionAccepted(savedSession);
        return load({ fresh: true });
      })
      .catch((error) => {
        toast({
          title: 'تعذر اعتماد التسميع',
          description: recitationErrorMessage(error, 'بقي التقييم محفوظًا على الجهاز وتنتظر مزامنته.'),
          variant: 'destructive',
        });
        return load({ fresh: true });
      });
  }, [load, supervisorId, toast]);

  const saveCountOnlyRecitation = async ({ itemCounts }) => {
    if (!selectedStudent?.tasks?.length) return;
    setIsSavingCount(true);
    try {
      const taskPayloads = sortRecitationTasks(selectedStudent.tasks).map((task) => {
        const counts = itemCounts[String(task.id)] || { hesitationCount: 0, warningCount: 0, mistakeCount: 0 };
        const payload = {
          evaluationMode: 'count',
          warningCount: counts.warningCount,
          hesitationCount: counts.hesitationCount || 0,
          mistakeCount: counts.mistakeCount,
          ...(task.taskType === 'memorization' && selectedStudent.repeatCount !== undefined
            ? { repeatCount: selectedStudent.repeatCount }
            : {}),
          ...(task.taskType === 'memorization' && selectedStudent.listeningCount !== undefined
            ? { listeningCount: selectedStudent.listeningCount }
            : {}),
        };
        return { task, payload: { ...payload, offlineOutcome: offlineOutcome(task, payload, data?.gradingPolicy) } };
      });
      const session = await commitOfflineRecitation({
        supervisorId,
        studentId: selectedStudent.studentId,
        sessionDate: data?.date,
        tasks: taskPayloads,
      });
      markRecitationPending(selectedStudent.studentId, selectedStudent.tasks, session);
      setSelectedStudent(null);
      syncRecitationInBackground(session.sessionId);
    } catch (error) {
      toast({ title: 'تعذر إنهاء التسميع', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingCount(false);
    }
  };

  const markNotMemorized = async (student) => {
    const memorizationTasks = (student.tasks || []).filter((task) => (
      canMarkRecitationFailed(task)
    ));
    if (!memorizationTasks.length || isSavingCount) return;
    setIsSavingCount(true);
    try {
      const session = await commitOfflineRecitation({
        supervisorId,
        studentId: student.studentId,
        sessionDate: data?.date,
        tasks: sortRecitationTasks(memorizationTasks).map((task) => {
          const type = evaluationTypeForTask(task);
          const payload = {
            evaluationMode: data?.evaluationModes?.[type] || 'mushaf',
            notMemorized: true,
          };
          return { task, payload: { ...payload, offlineOutcome: offlineOutcome(task, payload, data?.gradingPolicy) } };
        }),
      });
      markRecitationPending(student.studentId, memorizationTasks, session);
      setSelectedStudent(null);
      toast({ title: RECITATION_FAILED_LABEL, description: 'حُفظت النتيجة.' });
      syncRecitationInBackground(session.sessionId);
    } catch (error) {
      toast({ title: 'تعذر حفظ النتيجة محليًا', description: error.message, variant: 'destructive' });
    } finally { setIsSavingCount(false); }
  };

  const canMarkNotCompleted = selectedStudent?.tasks?.length > 0 && selectedStudent.tasks.every((task) => canMarkRecitationFailed(task));
  const notCompletedAction = canMarkNotCompleted ? (
    <Button type="button" variant="outline" className="min-h-11 [font-family:var(--font-ui)]" disabled={isSavingCount} onClick={() => setConfirmFailure(true)}>
      {RECITATION_FAILED_LABEL}
    </Button>
  ) : null;

  const content = (
    <div className="space-y-3">
      {loadError && <ErrorState retryAt={retryAt} message={loadError} onRetry={() => void load()} />}
      {(!loadError || Boolean(data?.tasks?.length || data?.students?.length)) && <TeacherRecitationTaskList
        tasks={data?.tasks || []}
        taskQueue={data?.taskQueue || []}
        students={data?.students || []}
        quranChapters={quranChapters}
        isLoading={isLoading}
        compensationDate={data?.date}
        onDayCompensated={() => load({ fresh: true })}
        onRecite={openRecitation}
        reading={data?.reading || []}
        onReading={setReadingStudent}
        onOpenCompensation={data?.allowQuranCompensation && navigator.onLine !== false ? setCompensationStudent : undefined}
        onAttendanceChange={data?.recitationAttendanceSource === 'teacher' ? updateAttendance : undefined}
        recitationAttendanceSource={data?.recitationAttendanceSource || 'supervisor'}
        attendancePendingIds={attendancePendingIds}
        teacherExecutionMode={Object.values(data?.executionSources || {}).some((source) => (
          ['teacher', 'both'].includes(source)
        ))}
        teacherAttendanceMode={Boolean(data?.students?.some((student) => student.canSetAttendance))}
        allowRepeatCountEditing={Boolean(data?.allowRepeatCountEditing)}
        listeningEnabled={Boolean(data?.listeningEnabled)}
        listeningCount={Number(data?.listeningCount || 3)}
        allowListeningCountEditing={Boolean(data?.allowListeningCountEditing)}
        executionSources={data?.executionSources}
        showAmounts={showAmounts}
      />}
    </div>
  );

  let recitationDialog;
  if (!selectedStudent) {
    recitationDialog = null;
  } else if (selectedEvaluationMode === 'count') {
      recitationDialog = <CountOnlyEvaluationDialog
      secondaryAction={notCompletedAction}
      open={Boolean(selectedStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setSelectedStudent(null)}
      title={`${Number(selectedTask?.compensationIndex || 0) > 0 ? 'تعويض' : 'تسميع'} ${selectedStudent?.studentName || ''}`}
      onSubmit={saveCountOnlyRecitation}
      isSaving={isSavingCount}
      supervisorId={supervisorId}
      studentId={selectedStudent?.studentId}
      items={(selectedStudent?.tasks || []).map((task, index) => ({ id: task.id, label: task.amount || task.rangeLabel || formatContinuousRecitationRange([task]) || `المقطع ${index + 1}`, fromPage: task.fromPage, hizbNumber: task.hizbNumber }))}
      gradingPolicy={data?.gradingPolicy}
      taskType={selectedStudent?.tasks?.[0]?.taskType}
    />;
    } else {
      recitationDialog = <Suspense fallback={<DashboardLoader />}><MushafRecitationDialog
      secondaryAction={notCompletedAction}
      supervisorId={supervisorId}
      student={selectedStudent}
      tasks={selectedStudent?.tasks || []}
      open={Boolean(selectedStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setSelectedStudent(null)}
      loadTaskData={(task) => loadCachedTaskData(supervisorId, task, { preferCache: true })}
      saveSessionResults={async (items) => {
        const session = await commitOfflineRecitation({
          supervisorId,
          studentId: selectedStudent.studentId,
          sessionDate: data?.date,
          tasks: items.map(({ task, payload }) => ({
            task,
            payload: {
              ...payload,
              offlineOutcome: offlineOutcome(task, payload, data?.gradingPolicy),
              ...(task.taskType === 'memorization' && selectedStudent?.repeatCount !== undefined
                ? { repeatCount: selectedStudent.repeatCount }
                : {}),
              ...(task.taskType === 'memorization' && selectedStudent?.listeningCount !== undefined
                ? { listeningCount: selectedStudent.listeningCount }
                : {}),
            },
          })),
        });
        markRecitationPending(selectedStudent.studentId, items.map(({ task }) => task), session);
        syncRecitationInBackground(session.sessionId);
        return { session, results: [], pending: true };
      }}
      onSaved={() => undefined}
    /></Suspense>;
    }

  const readingDialog = (
    <SelfReadingDialog
      entry={readingEntry}
      chapters={quranChapters}
      studentName={readingStudent?.studentName || ''}
      isSaving={isSavingReading}
      onSave={saveReading}
      onOpenChange={(nextOpen) => !nextOpen && setReadingStudent(null)}
    />
  );

  const failureDialog = <Dialog open={confirmFailure} onOpenChange={setConfirmFailure}>
    <DialogContent dir="rtl" className="[font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>تأكيد الرسوب</DialogTitle></DialogHeader>
      <p>سيُسجّل المقدار راسبًا ويعاد تسميعه. هل تريد المتابعة؟</p>
      <div className="flex gap-2"><Button variant="outline" disabled={isSavingCount} onClick={() => setConfirmFailure(false)}>إلغاء</Button><Button disabled={isSavingCount} onClick={() => { setConfirmFailure(false); void markNotMemorized(selectedStudent); }}>تأكيد الرسوب</Button></div>
    </DialogContent>
  </Dialog>;

  const compensationDialog = (
    <CompensationDialog
      open={Boolean(compensationStudent)}
      onOpenChange={(nextOpen) => !nextOpen && setCompensationStudent(null)}
      supervisorId={supervisorId}
      student={compensationStudent}
      date={data?.date}
      onRecite={reciteCompensation}
    />
  );

  if (inline) {
    return (
      <>
        <DashboardMobileHeaderActions>
          <RecitationAmountsToggle
            visible={showAmounts}
            onToggle={() => setShowAmounts((current) => !current)}
            compact
          />
        </DashboardMobileHeaderActions>
        <div className="min-w-0 [font-family:var(--font-ui)]">{content}</div>
        {recitationDialog}
        {compensationDialog}
        {readingDialog}
        {failureDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-primary neon-text">جلسات التسميع</DialogTitle>
            <RecitationAmountsToggle
              visible={showAmounts}
              onToggle={() => setShowAmounts((current) => !current)}
            />
          </DialogHeader>
          <div className="max-h-[72dvh] overflow-auto pr-1">{content}</div>
        </DialogContent>
      </Dialog>
      {recitationDialog}
      {compensationDialog}
      {readingDialog}
        {failureDialog}
    </>
  );
};

export default TeacherEvaluationDialog;
