import React, { useState } from 'react';
import ErrorState from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { gradingApi } from '@/services/gradingApi';
import GradeScore from './GradeScore';
import RelativeWeekNavigator from './RelativeWeekNavigator';
import TriStateChoice from './TriStateChoice';
import useGradeCommittees from './useGradeCommittees';
import useGradingWeek from './useGradingWeek';

const ATTENDANCE_LABELS = Object.freeze({ yes: 'حاضر', no: 'غائب' });

/** «الجلسة الأسبوعية»: the same page as «جلسة المسار», attendance only. */
export default function WeeklySessionSection() {
  const { toast } = useToast();
  const { committeeId, filter } = useGradeCommittees();
  const { status, error, week, today, editable, reload, setWeekStart } = useGradingWeek(committeeId);
  const [savingId, setSavingId] = useState(null);
  const students = week?.students || [];

  const save = async (student, attended) => {
    setSavingId(student.id);
    try {
      await gradingApi.setWeeklyComponent({ studentId: student.id, weekStart: week.weekStart, component: 'weekly', attended });
      await reload({ silent: true });
    } catch (requestError) {
      toast({ title: 'تعذر حفظ الجلسة الأسبوعية', description: requestError.message, variant: 'destructive' });
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
          const present = detail?.attended === true;
          return (
            <li key={student.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <div className="break-words text-base font-black leading-tight text-foreground">{student.name}</div>
                  <div className="mt-0.5 text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs">{student.committeeName || 'بدون حلقة'}</div>
                </div>
                {recorded && (
                  <GradeScore grade={present ? (session?.grade ?? 0) : 0} max={session?.max ?? week.maxima?.weeklySession} className="text-sm" />
                )}
              </div>
              <TriStateChoice
                ariaLabel={`حضور ${student.name} الجلسة الأسبوعية`}
                labels={ATTENDANCE_LABELS}
                allowNone={false}
                value={recorded ? present : null}
                onChange={(attended) => save(student, attended)}
                disabled={!editable || savingId !== null}
                className="w-32 shrink-0 sm:w-40"
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
        <div className="min-w-0 sm:me-auto">
          <RelativeWeekNavigator week={week} today={today} loading={status === 'loading'} onChange={setWeekStart} />
        </div>
        {filter && <div className="w-full sm:w-auto">{filter}</div>}
      </ManagementToolbar>
      {renderRows()}
    </ManagementPanel>
  );
}
