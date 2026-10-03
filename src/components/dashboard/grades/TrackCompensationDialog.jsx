import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DashboardDatePicker } from '../DashboardControls';
import { FormField } from '../layout/ManagementPanel';

export default function TrackCompensationDialog({ student, weekStart, weekEnd, today, saving, onSave, onClose }) {
  const maxDate = weekEnd < today ? weekEnd : today;
  const [date, setDate] = useState(maxDate);
  const [excuseReference, setExcuseReference] = useState('');
  const alreadyCompensated = student.compensations?.some(row => row.date === date);
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent dir="rtl" className="[font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>تعويض — {student.name}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">تُمنح درجات إنجاز اليوم كاملة، وتبقى درجات الحضور كما هي.</p>
      <FormField label="اليوم المراد تعويضه"><DashboardDatePicker ariaLabel="اليوم المراد تعويضه" value={date} min={weekStart} max={maxDate} onChange={setDate} disabled={saving} /></FormField>
      <FormField label="سبب التعويض أو مرجع الاستئذان المعتمد" htmlFor="compensation-reference"><Input id="compensation-reference" value={excuseReference} maxLength={500} disabled={saving} onChange={event => setExcuseReference(event.target.value)} /></FormField>
      {alreadyCompensated && <p role="alert" className="text-sm text-destructive">تم تعويض هذا اليوم مسبقًا.</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>إلغاء</Button><Button loading={saving} disabled={!date || excuseReference.trim().length < 3 || alreadyCompensated} onClick={() => onSave({date, excuseReference})}>تسجيل التعويض</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
