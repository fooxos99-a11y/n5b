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
import TriStateChoice from './TriStateChoice';
import useGradeCommittees from './useGradeCommittees';
import useGradingWeek from './useGradingWeek';

const ATTENDANCE_LABELS = Object.freeze({ yes: 'حاضر', no: 'غائب', none: 'غير مرصود' });

const wasTested = (detail) => Boolean(detail?.attended && detail.segments?.some((segment) => segment.recorded !== false));

/** «جلسة المسار» (the test): attendance of each student, then a segment-by-segment test for those present. */
export default function TrackSessionSection() {
  const { toast } = useToast();
  const { committeeId, filter } = useGradeCommittees();
  const weekState = useGradingWeek(committeeId);
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

  const students = week?.students || [];
  const testing = students.find((student) => student.id === testingId) || null;
  const segmentCount = week?.policy?.trackSession?.segmentCount ?? policyState.segmentCount;

  const save = async (student, payload, successTitle) => {
    setSavingId(student.id);
    try {
      await gradingApi.setWeeklyComponent({ studentId: student.id, weekStart: week.weekStart, component: 'track', ...payload });
      await reload({ silent: true });
      if (successTitle) toast({ title: successTitle });
      return true;
    } catch (requestError) {
      toast({ title: 'تعذر حفظ جلسة المسار', description: requestError.message, variant: 'destructive' });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const setAttendance = (student, attended) => {
    const detail = student.grade?.trackDetail;
    // Present without a test yet: attendance counts, the segments wait for «اختبر».
    const segments = attended && wasTested(detail)
      ? detail.segments.map(({ mistakes, warnings }) => ({ mistakes, warnings, recorded: true }))
      : Array.from({ length: attended ? segmentCount : 0 }, () => ({ recorded: false }));
    return save(student, { attended, segments });
  };

  const saveTest = async (segments) => {
    if (await save(testing, { attended: true, segments }, 'تم حفظ الاختبار')) setTestingId(null);
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
          const present = detail?.attended === true;
          const busy = savingId !== null;
          const tested = wasTested(detail);
          const finalGrade = detail ? session?.grade : null;
          return (
            <li key={student.id} className="flex flex-wrap items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-nowrap sm:px-6">
              <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-3 gap-y-2 sm:basis-auto">
                <div className="min-w-0">
                  <div className="break-words text-base font-black leading-tight text-foreground">{student.name}</div>
                  <div className="mt-0.5 text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs">{student.committeeName || 'بدون حلقة'}</div>
                </div>
                {finalGrade !== null && finalGrade !== undefined && (
                  <GradeScore grade={finalGrade} max={session?.max ?? week.maxima?.trackSession} className="text-sm" />
                )}
              </div>
              {/* Always reserved so the attendance choice never moves when «اختبر» appears. */}
              <div className="w-16 shrink-0 sm:w-20">
                {present && segmentCount > 0 && (
                  <Button type="button" variant={tested ? 'outline' : 'default'} className="h-11 w-full whitespace-normal rounded-lg px-1 text-xs leading-4" disabled={!editable || busy} onClick={() => setTestingId(student.id)}>
                    {tested ? 'إعادة الاختبار' : 'اختبر'}
                  </Button>
                )}
              </div>
              <TriStateChoice
                ariaLabel={`حضور ${student.name} جلسة المسار`}
                labels={ATTENDANCE_LABELS}
                allowNone
                value={detail ? present : null}
                onChange={(attended) => {
                  if (tested && attended !== true) setPendingAttendance({ student, attended });
                  else setAttendance(student, attended);
                }}
                disabled={!editable || busy}
                className="w-44 shrink-0 sm:w-56"
              />
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
              if (await setAttendance(pendingAttendance.student, pendingAttendance.attended)) setPendingAttendance(null);
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
          segmentCount={segmentCount}
          saving={savingId === testing.id}
          onSave={saveTest}
          onClose={() => setTestingId(null)}
        />
      )}
    </>
  );
}
