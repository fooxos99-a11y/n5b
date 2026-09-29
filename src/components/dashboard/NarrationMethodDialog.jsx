import React from 'react';
import { BookOpen, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function NarrationMethodDialog({ open, onOpenChange, onSelect }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="max-w-sm [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>التسميع عن طريق:</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Button type="button" variant="outline" className="min-h-12 justify-start" onClick={() => onSelect('mushaf')}><BookOpen className="h-5 w-5 shrink-0" />المصحف</Button>
        <Button type="button" variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-start" onClick={() => onSelect('count')}><ListChecks className="h-5 w-5 shrink-0" />تسجيل عدد الأخطاء والتنبيهات</Button>
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
