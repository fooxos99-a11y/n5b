import { formatClockTime } from '../../../shared/clock-time.js';
import React from 'react';
import { CheckCircle2, Clock3, MapPin } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementPanel } from '@/components/dashboard/layout/ManagementPanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const statusLabel = (status) => {
  if (status === 'present') return 'حاضر';
  if (status === 'late') return 'متأخر';
  if (status === 'absent') return 'غائب';
  if (status === 'excused') return 'مستأذن';
  if (status === 'pending_sync') return 'محفوظ محليًا وينتظر المزامنة';
  return 'لم يتم التحضير';
};

export default function StaffAttendanceSection({ attendanceState }) {
  const { toast } = useToast();
  const { attendance, loading, pending, error, refresh, checkIn } = attendanceState;
  if (loading && !attendance) return <DashboardLoader className="min-h-[320px]" />;

  return (
    <ManagementPanel className="mx-auto max-w-xl">
      <div className="space-y-5 px-4 py-8 text-center sm:px-6">
        {error && <div role="alert" className="space-y-3 text-destructive">
          <p>{error.message}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={refresh}>إعادة المحاولة</Button>
        </div>}
        {attendance?.alreadyPresent
          ? <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          : <Clock3 className="mx-auto h-14 w-14 text-accent" />}
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-primary">تحضير</h2>
          <div className="text-lg font-black text-foreground">{statusLabel(attendance?.status)}</div>
          {attendance?.checkInTime && <div className="text-sm font-bold text-muted-foreground" dir="ltr">{formatClockTime(attendance.checkInTime)}</div>}
        </div>
        {attendance?.canAttend && (
          <Button
            type="button"
            className="h-12 min-w-40"
            disabled={pending}
            onClick={() => checkIn().catch((error) => toast({ title: 'تعذر تسجيل التحضير', description: error.message, variant: 'destructive' }))}
          >
            <MapPin className="h-5 w-5" /> حاضر
          </Button>
        )}
      </div>
    </ManagementPanel>
  );
}
