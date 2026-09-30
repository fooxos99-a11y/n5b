import { isRecitationAttendanceVisible } from '../../../shared/recitation-attendance-policy.js';
import React, { useMemo, useState } from 'react';
import { isRecitationActionPending, shouldShowRecitationStudent } from '@/lib/recitationActionState';
import RecitationIdentity from '@/components/portal/RecitationIdentity';
import './recitation-reference.css';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import RecitationAyahMarks from '@/components/portal/RecitationAyahMarks';
import RecitationAmountVisibility from '@/components/portal/RecitationAmountVisibility';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatContinuousRecitationRange, groupContinuousRecitationTasks, sortRecitationTasks } from '@/lib/recitationTaskRanges';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';
import RecitationEndSelector from '@/components/portal/RecitationEndSelector';
import ListeningChoice from '@/components/portal/ListeningChoice';
import RepeatCountSelector from '@/components/portal/RepeatCountSelector';
import TeacherRecitationAction from '@/components/portal/TeacherRecitationAction';
import TeacherRecitationPractice from '@/components/portal/TeacherRecitationPractice';
import { getRecitationStatusLabel } from '@/lib/recitationEvaluation';

const evaluationTypeForTask = (task) => (
  task.taskType === 'memorization' && task.track === 'mastery'
    ? 'mastery'
    : task.taskType
);

const attendanceStatuses = [
  { value: 'present', label: 'حاضر' },
  { value: 'late', label: 'متأخر' },
  { value: 'excused', label: 'مستأذن' },
  { value: 'absent', label: 'غائب' },
];

const TeacherRecitationTaskList = ({
  tasks = [],
  taskQueue = [],
  students = [],
  quranChapters = [],
  isLoading = false,
  onRecite,
  reading = [],
  onReading,
  onOpenCompensation,
  onAttendanceChange,
  attendancePendingIds = [],
  teacherExecutionMode = false,
  teacherAttendanceMode = false,
  recitationAttendanceSource = 'teacher',
  listeningEnabled = false,
  listeningCount = 3,
  executionSources,
  showMarks = false,
  showAmounts = true,
  emptyText = 'لا توجد مهام للتقييم.',
}) => {
  const [selectedEnds, setSelectedEnds] = useState({});
  const [selectedRepeatCounts, setSelectedRepeatCounts] = useState({});
  const [selectedListeningCounts, setSelectedListeningCounts] = useState({});
  const updateSelectedEnd = (key, value) => setSelectedEnds((current) => ({ ...current, [key]: value }));
  const updateListeningCount = (key, value) => setSelectedListeningCounts((current) => ({ ...current, [key]: value }));
  const readingByStudent = useMemo(() => new Map(reading.map((entry) => [String(entry.studentId), entry])), [reading]);
  const grouped = useMemo(() => {
    const map = new Map();
    const studentById = new Map(students.map((student) => [String(student.studentId), student]));
    if (teacherAttendanceMode || onRecite) {
      students.forEach((student) => {
        map.set(String(student.studentId), { ...student, tasks: [] });
      });
    }
    tasks.forEach((task) => {
      // Compensation amounts are recited from the compensation window, not the day's actions.
      if (onRecite && Number(task.compensationIndex || 0) > 0) return;
      const studentId = String(task.studentId);
      if (teacherAttendanceMode && !studentById.has(studentId)) return;
      if (!map.has(studentId)) {
        map.set(studentId, {
          ...(studentById.get(studentId)),
          studentId: task.studentId,
          studentName: task.studentName,
          tasks: [],
        });
      }
      map.get(studentId).tasks.push(task);
    });
    return [...map.values()]
      .filter((student) => !onRecite || (recitationAttendanceSource === 'teacher' && student.canSetAttendance) || student.readingOnly || readingByStudent.has(String(student.studentId)) || isRecitationAttendanceVisible(student.attendanceStatus, recitationAttendanceSource === 'teacher' && student.canSetAttendance))
      // A student stays listed while the day's self reading is still to be recorded.
      .filter((student) => !onRecite || shouldShowRecitationStudent(student, student.tasks, taskQueue)
        || readingByStudent.get(String(student.studentId))?.status === null)
      .map((student) => ({ ...student, tasks: sortRecitationTasks(student.tasks) }));
  }, [students, tasks, taskQueue, teacherAttendanceMode, recitationAttendanceSource, onRecite, readingByStudent]);

  if (isLoading) return <DashboardLoader />;
  if (grouped.length === 0) {
    return <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="recitation-reference recitation-students">
      {grouped.map((student) => {
        const taskGroups = groupContinuousRecitationTasks(student.tasks);
        const attendanceEditable = Boolean(onAttendanceChange) && recitationAttendanceSource === 'teacher' && student.canSetAttendance;
        const attendanceAllowsActions = ['present', 'late'].includes(student.attendanceStatus);
        const canRecite = !student.offlineSequenceBlocked && attendanceAllowsActions;
        const pendingTasks = student.tasks.filter(isRecitationActionPending);
        const recitationActions = [
          {
            key: 'saved',
            label: 'حفظ',
            sourceKey: 'memorization',
            tasks: pendingTasks.filter((task) => evaluationTypeForTask(task) === 'memorization'),
          },
          {
            key: 'review',
            label: 'مراجعة',
            sourceKey: 'review',
            tasks: pendingTasks.filter((task) => evaluationTypeForTask(task) === 'review'),
          },
          {
            key: 'link',
            label: 'ربط',
            sourceKey: 'link',
            tasks: pendingTasks.filter((task) => evaluationTypeForTask(task) === 'link'),
          },
        ].filter((action) => {
          if (action.empty) return false;
          if (!action.tasks.length) return false;
          if (action.sourceKey === 'memorization') return true;
          if (!executionSources) return true;
          return ['teacher', 'both'].includes(executionSources[action.sourceKey]);
        });
        const hasRecitationTasks = recitationActions.some((action) => action.empty || action.tasks.length > 0);
        const actionViews = recitationActions.map((action) => {
          const actionKey = `${student.studentId}:${action.key}:${action.tasks[0]?.id}`;
          const actionTeacherExecutionMode = ['teacher', 'both'].includes(
            executionSources?.[action.sourceKey] || 'teacher',
          );
          const repeatClaimedByStudent = action.tasks[0]?.repeatExecutionActorRole === 'student';
          const defaultRepeatCount = Number((repeatClaimedByStudent
            ? action.tasks[0]?.actualRepeatCount
            : action.tasks[0]?.expectedRepeatCount) ?? 1);
          const defaultListeningCount = Number((repeatClaimedByStudent
            ? action.tasks[0]?.actualListeningCount
            : action.tasks[0]?.expectedListeningCount ?? listeningCount) ?? 1);
          const actionAmount = action.empty ? 'لا يوجد محفوظ للربط' : formatContinuousRecitationRange(action.tasks);
          const amountControl = renderRecitationAmountControl({ action, actionKey, selectedEnds, updateSelectedEnd, teacherExecutionMode, actionTeacherExecutionMode, quranChapters });
          const repeatEditable = teacherExecutionMode && ['teacher', 'both'].includes(executionSources?.repeat || 'teacher') && action.key === 'saved';
          const repeatControl = action.key === 'saved' ? (
            <RepeatCountSelector label="" editable={repeatEditable && !repeatClaimedByStudent}
              ariaLabel={`هل كرر ${student.studentName}؟`} value={selectedRepeatCounts[actionKey] ?? defaultRepeatCount}
              onChange={(value) => setSelectedRepeatCounts((current) => ({ ...current, [actionKey]: value }))} compact />
          ) : null;
          const listeningControl = action.key === 'saved' && listeningEnabled ? (
            <ListeningChoice label="" value={selectedListeningCounts[actionKey] ?? defaultListeningCount}
              disabled={!repeatEditable || repeatClaimedByStudent} ariaLabel={`هل استمع ${student.studentName}؟`}
              onChange={(value) => updateListeningCount(actionKey, value)} compact />
          ) : null;
          return {
            action,
            actionKey,
            actionAmount,
            amountControl,
            repeatControl,
            listeningControl,
            defaultRepeatCount,
            defaultListeningCount,
          };
        });
        const memorizationView = actionViews.find((item) => item.action.key === 'saved');
        const hasBothTracks = Boolean(memorizationView && actionViews.some((item) => item.action.key === 'mastery'));
        const actionOrder = ['saved', 'link', 'review', 'mastery'];
        const position = (item) => actionOrder.indexOf(item.action.key === 'mastery' && !memorizationView ? 'saved' : item.action.key);
        const displayActionViews = [...actionViews].sort((a, b) => position(a) - position(b));
        const readingEntry = onReading ? readingByStudent.get(String(student.studentId)) : null;
        const canRecord = Boolean(readingEntry) && attendanceAllowsActions;
        const readingSummary = readingEntry?.status === 'read'
          ? `قرأ ${readingEntry.recordedFaces ?? readingEntry.faces} وجه`
          : readingEntry?.status === 'missed' ? 'لم يقرأ' : `${readingEntry?.faces ?? ''} وجه`;
        const _resolveTeacherRecitationTaskList = () => {
          if (student.recitationPending) {
            return 'حُفظت النتيجة';
          }
          if (student.recitationFinished || (student.tasks.length > 0 && pendingTasks.length === 0)) {
            return 'اكتمل التسميع';
          }
          return 'لا يوجد مقدار للتسميع';
        };
        const compensationAction = onOpenCompensation && canRecite && student.hasCompensation ? (
          <button type="button" className="recitation-compensation"
            aria-label={`تعويض ${student.studentName}`} onClick={() => onOpenCompensation(student)}>
            تعويض
          </button>
        ) : null;
        return (
          <div key={student.studentId} className="recitation-reference-card">
            <div className="min-w-0">
              <RecitationIdentity name={student.studentName} nameAction={compensationAction}>
                {attendanceEditable && (
                  <Select
                    value={student.attendanceStatus || ''}
                    onValueChange={(value) => onAttendanceChange?.(student, value)}
                    disabled={attendancePendingIds.includes(Number(student.studentId))}
                  >
                    <SelectTrigger
                      showChevron={false}
                      aria-label={`تحضير ${student.studentName}`}
                      className="recitation-attendance"
                    >
                      <SelectValue placeholder="اختر الحالة" />
                    </SelectTrigger>
                    <SelectContent className="!min-w-0 !w-36">
                      {attendanceStatuses.map((status) => (
                        <SelectItem key={status.value} value={status.value} textClassName="whitespace-nowrap break-normal">
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </RecitationIdentity>

              {onRecite && ((hasRecitationTasks && canRecite) || canRecord) && (
                <div className="recitation-actions" data-has-both-tracks={hasBothTracks} data-has-reading={canRecord}>
                  {canRecite && displayActionViews.map(({
                    action,
                    actionKey,
                    defaultRepeatCount,
                    defaultListeningCount,
                    actionAmount,
                    amountControl,
                  }) => {
                    return (
                      <TeacherRecitationAction
                        key={action.key}
                        label={action.label}
                        slot={action.key === 'mastery' && !memorizationView ? 'saved' : action.key}
                        amount={actionAmount}
                        amountControl={amountControl}
                        showAmount={showAmounts}
                        active
                        disabled={action.empty || !canRecite || action.tasks.length === 0}
                        onClick={() => {
                          const selectedStudent = {
                            ...student,
                            tasks: action.tasks,
                            actualEnd: selectedEnds[actionKey] || action.tasks[0]?.normalEnd || null,
                            repeatCount: action.key === 'saved' && teacherExecutionMode
                              ? selectedRepeatCounts[actionKey] ?? defaultRepeatCount
                              : undefined,
                            listeningCount: action.key === 'saved' && teacherExecutionMode && listeningEnabled
                              ? selectedListeningCounts[actionKey] ?? defaultListeningCount
                              : undefined,
                          };
                          onRecite?.(selectedStudent);
                        }}
                      />
                    );
                  })}
                  {canRecord && (
                    <TeacherRecitationAction
                      label="الذاتي"
                      slot="reading"
                      amount={readingSummary}
                      showAmount={showAmounts || readingEntry.status !== null}
                      active={readingEntry.status === null}
                      onClick={() => onReading(student)}
                    />
                  )}
                </div>
              )}

              {showAmounts && onRecite && hasRecitationTasks && canRecite && (
                <TeacherRecitationPractice repeatControl={memorizationView?.repeatControl} listeningControl={memorizationView?.listeningControl} />
              )}

              {canRecite && !hasRecitationTasks && !canRecord && (
                <span className="self-center text-xs font-bold text-muted-foreground">
                  {_resolveTeacherRecitationTaskList()}
                </span>
              )}

              {!onRecite && (
                <div className="col-span-1 w-full space-y-2 border-t border-primary/10 pt-2 sm:col-span-2">
                  {taskGroups.map((group) => {
                    const groupTasks = group.tasks;
                    const firstTask = groupTasks[0];
                    const groupKey = groupTasks.map((task) => task.id).join('-');
                    const isCompletedGroup = groupTasks.every((task) => task.teacherCompleted != null);
                    const mistakeCount = groupTasks.reduce((total, task) => total + Number(task.mistakeCount || 0), 0);
                    const warningCount = groupTasks.reduce((total, task) => total + Number(task.warningCount || 0), 0);
                    const marks = groupTasks.flatMap((task) => task.ayahMarks || []);
                    const _resolveTeacherCompleted = () => {
                      if (groupTasks.some((task) => task.teacherCompleted === false)) {
                        return false;
                      }
                      if (groupTasks.every((task) => task.teacherCompleted === true)) {
                        return true;
                      }
                      return null;
                    };
                    const statusLabel = getRecitationStatusLabel({
                      teacherCompleted: _resolveTeacherCompleted(),
                      teacherRatingKey: groupTasks.find((task) => task.teacherRatingKey)?.teacherRatingKey,
                      mistakeCount,
                      warningCount,
                    });
                    const marksFromPreviousAttempt = groupTasks.some((task) => task.marksFromPreviousAttempt);
                    return (
                      <div key={groupKey} className="rounded-lg border border-primary/10 bg-background/30 p-2.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="text-xs font-black text-primary">{getQuranTaskLabel(firstTask)}:</span>
                          <RecitationAmountVisibility
                            amount={formatContinuousRecitationRange(groupTasks)}
                            visible={showAmounts}
                          />
                          {showAmounts && firstTask.taskType === 'memorization' && isCompletedGroup && (
                            <>
                              <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[11px] font-black text-violet-600">
                                التكرار {Math.max(0, Number(firstTask.actualRepeatCount || 0))}
                              </span>
                              <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[11px] font-black text-cyan-700">
                                السماع {Number(firstTask.actualListeningCount || 0) > 0 ? 'نعم' : 'لا'}
                              </span>
                            </>
                          )}
                          {['يحتاج إعادة', 'لم يُستكمل'].includes(statusLabel) && (
                            <span className={`rounded-full px-2 py-1 text-[11px] font-black ${statusLabel === 'يحتاج إعادة' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-700'}`}>
                              {statusLabel}
                            </span>
                          )}
                          {isCompletedGroup ? (
                            <div className="ms-auto flex shrink-0 items-center gap-1">
                              <span className="flex h-8 min-w-14 items-center justify-center rounded-md border border-red-200 px-1.5 text-[11px] font-black text-red-600">{mistakeCount} خطأ</span>
                              <span className="flex h-8 min-w-14 items-center justify-center rounded-md border border-amber-200 px-1.5 text-[11px] font-black text-amber-600">{warningCount} تنبيه</span>
                            </div>
                          ) : null}
                        </div>
                        {showMarks && marks.length > 0 && (
                          <div className="mt-2">
                            <RecitationAyahMarks marks={marks} historical={marksFromPreviousAttempt} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TeacherRecitationTaskList;

function renderRecitationAmountControl({ action, actionKey, selectedEnds, updateSelectedEnd, teacherExecutionMode, actionTeacherExecutionMode, quranChapters }) {
  const canSelectEnd = teacherExecutionMode
  && actionTeacherExecutionMode
  && ['saved', 'review', 'mastery'].includes(action.key)
  && action.tasks[0]?.options?.length > 0;
  if (!canSelectEnd) return null;
  const firstTask = action.tasks[0];
  const selected = selectedEnds[actionKey] || firstTask.normalEnd || {
    page: action.tasks[action.tasks.length - 1]?.toPage,
    surah: action.tasks[action.tasks.length - 1]?.toSurah,
    ayah: action.tasks[action.tasks.length - 1]?.toAyah,
    surahName: action.tasks[action.tasks.length - 1]?.toSurahName,
  };
  return (
    <RecitationEndSelector
      start={{
        page: firstTask.fromPage,
        surah: firstTask.fromSurah,
        ayah: firstTask.fromAyah,
        surahName: firstTask.fromSurahName,
      }}
      options={firstTask.options}
      value={selected}
      chapters={['saved', 'review', 'mastery'].includes(action.key) ? quranChapters : []}
      allowedStart={firstTask.selectionStart}
      allowedEnd={firstTask.selectionEnd}
      direction={firstTask.selectionDirection}
      onChange={(value) => updateSelectedEnd(actionKey, value)}
      compact
    />
  );
}
