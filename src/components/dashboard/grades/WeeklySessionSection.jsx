import SessionCompensationActions from './SessionCompensationActions';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { gradingApi } from '@/services/gradingApi';
import GradeScore from './GradeScore';
import RelativeWeekNavigator from './RelativeWeekNavigator';
import SessionAttendanceSelect from './SessionAttendanceSelect';
import { sessionAttendanceStatus } from '../../../../shared/session-attendance.js';
import useGradeCommittees from './useGradeCommittees';
import useGradingWeek from './useGradingWeek';
import useOptimisticSession from './useOptimisticSession';
import usePrepareAllAttendance from './usePrepareAllAttendance';

/** The weekly session records attendance only. */
export default function WeeklySessionSection() {
  const { toast } = useToast();
  const { committeeId, filter } = useGradeCommittees();
  const { status, error, week, today, editable, reload, setWeekStart } = useGradingWeek(committeeId, 'weekly');
  const [savingId, setSavingId] = useState(null);
  const optimistic = useOptimisticSession(week, committeeId, 'weekly');
  const { students } = optimistic;
  const { preparing, canPrepare, prepareAll } = usePrepareAllAttendance({ students, component: 'weekly', week, reload, enabled: editable && status === 'ready' && savingId === null });
  const busy = savingId !== null || preparing;

  const save = async (student, attendanceStatus) => {
    optimistic.begin(student, { attendanceStatus });
    setSavingId(student.id);
    let saved = false;
    try {
      await gradingApi.setWeeklyComponent({ studentId: student.id, weekStart: week.weekStart, component: 'weekly', attendanceStatus });
      saved = true;
      await reload({ silent: true });
      optimistic.clear();
    } catch (requestError) {
      if (!saved) optimistic.clear();
      toast({ title: saved ? 'حُفظ الحضور وتعذر تحديث القائمة' : 'تعذر حفظ الجلسة الأسبوعية', description: requestError.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const renderRows = () => {
    if (status === 'loading') return <DashboardLoader />;
    if (status === 'error') return <ErrorState message={error} onRetry={() => reload().catch(() => undefined)} />;
    if (!students.length) {
      return <ManagementEmpty>لا يوجد طلاب حالياً.</ManagementEmpty>;
    }
    return (
      <ManagementList label="الجلسة الأسبوعية">
        {students.map((student) => {
          const detail = student.grade?.weeklyDetail;
          const session = student.grade?.weeklySession;
          const recorded = Boolean(detail);
          return (
            <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <div className="break-words text-base font-black leading-tight text-foreground">{student.name}</div>
                  <div className="mt-0.5 text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs">{student.committeeName || 'بدون حلقة'}</div>
                </div>
                {recorded && (
                  <GradeScore grade={session?.grade ?? 0} max={session?.max ?? week.maxima?.weeklySession} className="text-sm" />
                )}
              </div>
              <SessionCompensationActions studentId={student.id} studentName={student.name} scope="program" eligibleDays={student.compensationDays?.program || []} compensations={student.compensations} canManage={week.canManageCompensations} date={week.weekEnd < today ? week.weekEnd : today} weekStart={week.weekStart} weekEnd={week.weekEnd} today={today} disabled={!editable || busy} onSaved={() => reload({ silent: true })} />
              <SessionAttendanceSelect
                ariaLabel={`حضور ${student.name} الجلسة الأسبوعية`}
                value={recorded ? sessionAttendanceStatus(detail) : null}
                onChange={(attendanceStatus) => save(student, attendanceStatus)}
                disabled={!editable || busy}
              />
            </li>
          );
        })}
      </ManagementList>
    );
  };

  return (
    <ManagementPanel>
      <ManagementToolbar>
        <div className="flex w-full min-w-0 items-center gap-2 sm:me-auto sm:w-auto">
          <div className="min-w-0 flex-[2] sm:flex-none">
            <RelativeWeekNavigator week={week} today={today} loading={status === 'loading' || busy} onChange={setWeekStart} />
          </div>
          {filter && <fieldset disabled={busy} className="min-w-0 flex-1 sm:flex-none">{filter}</fieldset>}
        </div>
        <Button type="button" loading={preparing} disabled={!canPrepare || busy} onClick={() => { void prepareAll(); }}>تحضير الكل</Button>
      </ManagementToolbar>
      {renderRows()}
    </ManagementPanel>
  );
}
