import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

export default function StaffAttendancePrompt({ active, attendanceState }) {
  const { toast } = useToast();
  const { attendance, loading, pending, checkIn } = attendanceState;
  const [cancelled, setCancelled] = useState(false);
  const open = Boolean(active && !loading && !cancelled && attendance?.canAttend);

  useEffect(() => {
    setCancelled(false);
  }, [attendance?.date]);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) setCancelled(true); }}>
      <DialogContent className="w-[calc(100%-3rem)] max-w-xs gap-5 p-5 sm:max-w-xs sm:p-5 [font-family:var(--font-ui)]" dir="rtl" aria-describedby={undefined}>
        <DialogHeader className="text-center"><DialogTitle>تأكيد التحضير</DialogTitle></DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => setCancelled(true)}>إلغاء</Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() => checkIn().catch((error) => toast({ title: 'تعذر تسجيل التحضير', description: error.message, variant: 'destructive' }))}
          >حاضر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
