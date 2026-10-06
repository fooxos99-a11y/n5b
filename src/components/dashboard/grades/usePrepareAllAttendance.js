import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { gradingApi } from '@/services/gradingApi';
import { prepareSessionAttendance, studentsToPrepare } from '@/services/sessionAttendanceBatch';

export default function usePrepareAllAttendance({ students, component, week, segmentCount, reload, enabled }) {
  const [preparing, setPreparing] = useState(false);
  const running = useRef(false);
  const { toast } = useToast();
  const canPrepare = enabled && studentsToPrepare(students, component).length > 0;
  const prepareAll = async () => {
    if (!canPrepare || running.current) return;
    running.current = true;
    setPreparing(true);
    try {
      const result = await prepareSessionAttendance({ students, component, weekStart: week.weekStart, segmentCount, save: gradingApi.setWeeklyComponent });
      await reload({ silent: true });
      toast(result.failed
        ? { title: 'تعذر تحضير بعض الطلاب', description: `تم تحضير ${result.saved}، وتعذر تحضير ${result.failed}. يمكنك إعادة المحاولة.`, variant: 'destructive' }
        : { title: 'تم تحضير الكل' });
    } catch (error) {
      toast({ title: 'تعذر تحديث قائمة الحضور', description: error.message, variant: 'destructive' });
    } finally {
      running.current = false;
      setPreparing(false);
    }
  };
  return { preparing, canPrepare, prepareAll };
}
