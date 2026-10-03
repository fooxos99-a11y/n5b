import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatQuranRangeText } from '@/lib/quranRangeText';

/** The server assigns self reading from the student's memorized material. */
export default function SelfReadingDialog({ entry, studentName, isSaving = false, onSave, onOpenChange }) {
  const amount = entry?.amount;
  const available = Boolean(amount?.ranges?.length && amount.faces > 0);
  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-sm [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle>القراءة الذاتية — {studentName}</DialogTitle></DialogHeader>
        {available ? <div className="max-h-[55dvh] space-y-2 overflow-y-auto text-sm">
          {amount.ranges.map((range, index) => <p key={index}>{formatQuranRangeText(range)}</p>)}
          <p className="font-bold">{entry.expectedHizbs ? `${amount.hizbCount} حزب` : `${amount.faces} أوجه`}</p>
        </div> : <p className="text-sm text-muted-foreground">لا يوجد محفوظ لتحديد مقدار الذاتي.</p>}
        <DialogFooter className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={isSaving || !available} onClick={() => onSave({ completed: false })}>لم يقرأ</Button>
          <Button type="button" className="h-11" disabled={isSaving || !available} loading={isSaving} onClick={() => onSave({ completed: true })}>حفظ القراءة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
