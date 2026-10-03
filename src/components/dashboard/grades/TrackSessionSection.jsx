import SessionCompensationActions from './SessionCompensationActions';
import { formatHijriDate, formatHijriDateTime } from '../../../../shared/hijri-calendar.js';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ErrorState from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { gradingApi } from '@/services/gradingApi';
import GradeScore from './GradeScore';
import RelativeWeekNavigator from './RelativeWeekNavigator';
import TrackTestDialog from './TrackTestDialog';
import SessionAttendanceSelect from './SessionAttendanceSelect';
import { canTestSession, sessionAttendanceStatus } from '../../../../shared/session-attendance.js';
import useGradeCommittees from './useGradeCommittees';
import useGradingWeek from './useGradingWeek';
import useOptimisticSession from './useOptimisticSession';

const wasTested = (detail) => Boolean(detail && canTestSession(detail) && detail.segments?.some((segment) => segment.recorded !== false));

/** «جلسة المسار» (the test): attendance of each student, then a segment-by-segment test for those present. */
export default function TrackSessionSection() {
  const { toast } = useToast();
  const { committeeId, filter } = useGradeCommittees();
  const weekState = useGradingWeek(committeeId, 'track');
  const { status, error, week, today, editable, reload, setWeekStart } = weekState;
  const [policyState, setPolicyState] = useState({ status: 'loading', segmentCount: 0, error: '' });
  const [savingId, setSavingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [pendingAttendance, setPendingAttendance] = useState(null);

  const loadPolicy = useCallback(() => {
    setPolicyState({ status: 'loading', segmentCount: 0, error: '' });
    gradingApi.getPolicy()
      .then((result) => setPolicyState({ status: 'ready', segmentCount: Number(result.policy?.trackSession?.segmentCount) || 0, error: '' }))
      .catch((requestError) => setPolicyState({ status: 'error', segmentCount: 0, error: requestError.message }));
  }, []);
  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  const optimistic = useOptimisticSession(week, committeeId, 'track');
  const { students } = optimistic;
  const testing = students.find((student) => student.id === testingId) || null;
  const segmentCount = week?.policy?.trackSession?.segmentCount ?? policyState.segmentCount;

  const save = async (student, payload, successTitle) => {
    optimistic.begin(student, payload);
    setSavingId(student.id);
    let saved = false;
    try {
      await gradingApi.setWeeklyComponent({ studentId: student.id, weekStart: week.weekStart, component: 'track', ...payload });
      saved = true;
      await reload({ silent: true });
      optimistic.clear();
      if (successTitle) toast({ title: successTitle });
      return true;
    } catch (requestError) {
      if (!saved) optimistic.clear();
      toast({ title: saved ? 'حُفظت الجلسة وتعذر تحديث القائمة' : 'تعذر حفظ جلسة المسار', description: requestError.message, variant: 'destructive' });
      return saved;
    } finally {
      setSavingId(null);
    }
  };

  const setAttendance = (student, attendanceStatus) => {
    const detail = student.grade?.trackDetail;
    const attended = canTestSession({ attendanceStatus });
    // Present without a test yet: attendance counts, the segments wait for «اختبر».
    const segments = attended && wasTested(detail)
      ? detail.segments.map(({ mistakes, warnings, hesitations = 0, range }) => ({ mistakes, warnings, hesitations, range, recorded: true }))
      : Array.from({ length: attended ? segmentCount : 0 }, () => ({ recorded: false }));
    return save(student, { attendanceStatus, segments });
  };

  const saveTest = async (segments, attemptToken) => {
    if (await save(testing, { attendanceStatus: sessionAttendanceStatus(testing.grade?.trackDetail), segments, attemptToken }, 'تم حفظ الاختبار')) setTestingId(null);
  };

  const renderRows = () => {
    if (status === 'loading' || policyState.status === 'loading') return <DashboardLoader />;
    if (status === 'error') return <ErrorState message={error} onRetry={() => reload().catch(() => undefined)} />;
    if (policyState.status === 'error') return <ErrorState message={policyState.error} onRetry={loadPolicy} />;
    if (!students.length) {
      return <ManagementEmpty>لا يوجد طلاب حالياً.</ManagementEmpty>;
    }
    return (
      <ManagementList label="جلسة المسار">
        {students.map((student) => {
          const detail = student.grade?.trackDetail;
          const session = student.grade?.trackSession;
          const present = Boolean(detail && canTestSession(detail));
          const busy = savingId !== null;
          const tested = wasTested(detail);
          const finalGrade = detail ? session?.grade : null;
          return (
            <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <div className="break-words text-base font-black leading-tight text-foreground">{student.name}</div>
                  {(student.compensations || []).filter(row => row.scope === 'track' && !row.cancelledAt).map(row => <p key={row.id} className="mt-1 text-xs text-primary">تعويض {formatHijriDate(row.date)} · {row.actorName} · {formatHijriDateTime(row.recordedAt)}</p>)}
                  <div className="mt-0.5 text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs">{student.committeeName || 'بدون حلقة'}</div>
                </div>
                {finalGrade !== null && finalGrade !== undefined && (
                  <GradeScore grade={finalGrade} max={session?.max ?? week.maxima?.trackSession} className="text-sm" />
                )}
              </div>
              <div className="ms-auto flex shrink-0 flex-row-reverse items-center gap-2">
              <SessionAttendanceSelect
                ariaLabel={`حضور ${student.name} جلسة المسار`}
                value={detail && detail.attendanceRecorded !== false ? sessionAttendanceStatus(detail) : null}
                onChange={(attendanceStatus) => {
                  if (tested && !canTestSession({ attendanceStatus })) setPendingAttendance({ student, attendanceStatus });
                  else void setAttendance(student, attendanceStatus);
                }}
                disabled={!editable || busy}
              />
              <SessionCompensationActions studentId={student.id} studentName={student.name} scope="track" eligibleDays={student.compensationDays?.track || []} compensations={student.compensations} canManage={week.canManageCompensations} date={week.weekEnd < today ? week.weekEnd : today} weekStart={week.weekStart} weekEnd={week.weekEnd} today={today} disabled={!editable || busy} onSaved={() => reload({ silent: true })} />
              <div className="w-14 shrink-0 sm:w-20">
                {present && segmentCount > 0 && (
                  <Button type="button" variant={tested ? 'outline' : 'default'} className="h-11 w-full whitespace-normal rounded-lg px-1 text-xs leading-4" disabled={!editable || busy || detail?.operationType === 'compensation'} onClick={() => setTestingId(student.id)}>
                    {tested ? 'إعادة الاختبار' : 'اختبر'}
                  </Button>
                )}
              </div>
              </div>
            </li>
          );
        })}
      </ManagementList>
    );
  };

  return (
    <>
      <Dialog open={Boolean(pendingAttendance)} onOpenChange={(open) => { if (!open && savingId === null) setPendingAttendance(null); }}>
        <DialogContent dir="rtl" className="[font-family:var(--font-ui)]">
          <DialogTitle>تغيير حالة الطالب</DialogTitle>
          <p className="text-sm text-muted-foreground">سيُحذف تقييم المقاطع الحالي وتُحدّث الدرجة والنقاط. هل تريد المتابعة؟</p>
          <DialogFooter>
            <Button variant="outline" disabled={savingId !== null} onClick={() => setPendingAttendance(null)}>إلغاء</Button>
            <Button disabled={savingId !== null} onClick={async () => {
              if (await setAttendance(pendingAttendance.student, pendingAttendance.attendanceStatus)) setPendingAttendance(null);
            }}>تأكيد التغيير</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ManagementPanel>
        <ManagementToolbar>
          <div className="min-w-0 sm:me-auto">
            <RelativeWeekNavigator week={week} today={today} loading={status === 'loading'} onChange={setWeekStart} />
          </div>
          {filter && <div className="w-full sm:w-auto">{filter}</div>}
        </ManagementToolbar>
        {renderRows()}
      </ManagementPanel>
      {testing && (
        <TrackTestDialog
          key={`${testing.id}:${week.weekStart}`}
          student={testing}
          weekStart={week.weekStart}
          saving={savingId === testing.id}
          onSave={saveTest}
          onClose={() => setTestingId(null)}
        />
      )}
    </>
  );
}
