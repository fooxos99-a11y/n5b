import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';

function TeacherIndicator({ label, percentage, color, onClick }) {
  const value = Math.max(0, Math.min(100, Number(percentage) || 0));
  return <Button type="button" variant="ghost" onClick={onClick} className="h-auto min-h-14 w-full flex-col gap-2 rounded-lg px-1 py-2">
    <span className="flex w-full items-center justify-between gap-2 text-xs"><span>{label}</span><span>{formatNumber(value)}%</span></span>
    <span role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full bg-primary" style={{width: `${value}%`, ...(color ? {backgroundColor: color} : {})}} />
    </span>
  </Button>;
}

export default function TeachersPanel({ teachers = [], color }) {
  const [selection, setSelection] = useState(null);
  const [open, setOpen] = useState(false);
  const showDetails = (id, type) => { setSelection({id, type}); setOpen(true); };
  const teacher = teachers.find(row => row.id === selection?.id);
  const attendance = teacher?.attendance || {};
  const achievement = teacher?.achievement || {};
  const details = selection?.type === 'attendance' ? [
    ['الحضور', attendance.attended], ['التأخير', attendance.late], ['الغياب', attendance.absent],
    ['الأيام المطلوبة', attendance.expected],
    ['غير مرصود', Math.max(0, Number(attendance.expected || 0) - Number(attendance.attended || 0) - Number(attendance.absent || 0))],
  ] : [['الدرجات المحققة', achievement.grade], ['الدرجات المستحقة', achievement.max]];
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--app-shadow)] [font-family:var(--font-ui)]" aria-label="المعلمون">
    <h2 className="text-base font-bold">المعلمون</h2>
    {teachers.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {teachers.map(row => <li key={row.id} className="min-w-0 rounded-xl border border-border p-3">
        <p className="truncate text-sm font-bold">{row.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.committees || 'بدون حلقة'}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TeacherIndicator label="الحضور" percentage={row.attendance?.percentage} color={color} onClick={() => showDetails(row.id, 'attendance')} />
          <TeacherIndicator label="الإنجاز" percentage={row.achievement?.percentage} color={color} onClick={() => showDetails(row.id, 'achievement')} />
        </div>
      </li>)}
    </ul> : <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>}
    <Dialog open={open && Boolean(teacher)} onOpenChange={setOpen}>
      <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-md [font-family:var(--font-ui)]">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{selection?.type === 'attendance' ? 'الحضور' : 'الإنجاز'} — {teacher?.name}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="إغلاق التفاصيل" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <dl className="divide-y divide-border">
          {details.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3 text-sm"><dt>{label}</dt><dd className="font-bold tabular-nums">{formatNumber(value)}</dd></div>)}
        </dl>
      </DialogContent>
    </Dialog>
  </section>;
}
