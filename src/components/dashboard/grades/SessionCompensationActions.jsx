import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '../layout/ManagementPanel';
import { gradingApi } from '@/services/gradingApi';
import { useToast } from '@/components/ui/use-toast';
import { formatHijriDate, formatHijriDateTime } from '../../../../shared/hijri-calendar.js';

/** Only server-approved pending days are offered; administrative corrections keep their audit. */
export default function SessionCompensationActions({ studentId, studentName, scope, date, today, disabled, onSaved, eligibleDays, compensations = [], canManage = false }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [chosenDate, setChosenDate] = useState('');
  const [reference, setReference] = useState('');
  const [fetchedDays, setFetchedDays] = useState([]);
  const [daysError, setDaysError] = useState('');
  const [state, setState] = useState({ loading: false, loaded: false, busy: false, error: '', rows: [], canManage: false });
  const days = eligibleDays ?? fetchedDays;
  useEffect(() => {
    if (eligibleDays !== undefined || disabled) return;
    let current = true;
    gradingApi.getCompensationDays({ studentId, scope }).then(result => {
      if (current) { setFetchedDays(result.days || []); setDaysError(''); }
    }).catch(error => { if (current) setDaysError(error.message); });
    return () => { current = false; };
  }, [studentId, scope, date, today, disabled, eligibleDays]);
  const load = async selectedDate => {
    setState(current => ({ ...current, loading: true, loaded: false, error: '', rows: [], canManage: false }));
    try {
      const result = await gradingApi.getWeek({ weekStart: selectedDate });
      const student = result.students.find(row => Number(row.id) === Number(studentId));
      if (!student) throw new Error('لا تملك صلاحية الوصول إلى هذا الطالب.');
      setState(current => ({ ...current, loading: false, loaded: true, canManage: result.canManageCompensations,
        rows: (student.compensations || []).filter(row => row.scope === scope) }));
      setFetchedDays(student.compensationDays?.[scope] || []);
    } catch (error) { setState(current => ({ ...current, loading: false, error: error.message })); }
  };
  const active = state.rows.find(row => !row.cancelledAt && row.date === chosenDate);
  const pending = days.some(day => day.date === chosenDate);
  const run = async work => {
    setState(current => ({ ...current, busy: true, error: '' }));
    try {
      await work();
      setReference('');
      await onSaved?.();
      const result = await gradingApi.getCompensationDays({ studentId, scope });
      setFetchedDays(result.days || []);
      setOpen(false);
      toast({ title: 'حُفظت العملية' });
    } catch (error) { setState(current => ({ ...current, error: error.message })); }
    finally { setState(current => ({ ...current, busy: false })); }
  };
  const show = selectedDate => {
    setChosenDate(selectedDate); setReference(''); setOpen(true); void load(selectedDate);
  };
  const history = compensations.filter(row => row.scope === scope);
  if (!open && !days.length && !(canManage && history.length) && !daysError) return null;
  return <>
    {days.length > 0 && <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3 text-xs" disabled={disabled} onClick={() => show(days[0].date)}>تعويض</Button>}
    {canManage && history.length > 0 && <Button type="button" variant="ghost" className="min-h-11 px-3 text-xs" disabled={disabled} onClick={() => show(history[0].date)}>سجل التعويض</Button>}
    {daysError && <span role="alert" className="text-xs text-destructive">{daysError}</span>}
    <Dialog open={open} onOpenChange={value => { if (!state.busy) setOpen(value); }}>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>تعويض: {studentName}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{scope === 'track' ? 'تُمنح درجة المقاطع كاملة مع بقاء درجة الحضور كما هي.' : 'تُمنح درجات الحفظ والربط والمراجعة والذاتي كاملة مع بقاء الحضور كما هو.'}</p>
        {days.length > 0 && <div role="group" aria-label="الأيام المستحقة للتعويض" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {days.map(day => <Button key={day.date} type="button" variant="outline" aria-pressed={chosenDate === day.date} disabled={state.busy}
            className={`h-auto min-h-20 flex-col gap-2 whitespace-normal p-3 text-foreground ${chosenDate === day.date ? 'border-primary bg-primary/10' : ''}`}
            onClick={() => { setChosenDate(day.date); setReference(''); void load(day.date); }}>
            <span>يوم {day.dayNumber}</span><span className="text-xs font-normal">{formatHijriDate(day.date)}</span>
          </Button>)}
        </div>}
        {active && state.canManage && <FormField label="سبب الإلغاء الإداري" htmlFor={`compensation-reference-${studentId}`}>
          <Input id={`compensation-reference-${studentId}`} maxLength={500} value={reference} disabled={state.busy} onChange={event => setReference(event.target.value)} />
        </FormField>}
        {state.rows.map(row => <div key={row.id} className="rounded-lg border p-3 text-xs leading-6">
          <p>{row.cancelledAt ? 'تعويض ملغى' : 'تعويض'} {formatHijriDate(row.date)} · {row.actorName} · {formatHijriDateTime(row.recordedAt)}</p>
          <p>مرجع الاستئذان: {row.excuseReference}</p>
          {row.cancelledAt && <p>ألغاه {row.cancelledByName}: {row.cancellationReason}</p>}
          {state.canManage && !row.cancelledAt && <Button variant="ghost" className="min-h-11 text-xs" disabled={state.busy} onClick={() => { setChosenDate(row.date); setReference(''); }}>تصحيح هذا التعويض</Button>}
        </div>)}
        {state.loading && <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل اليوم…</p>}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={state.busy} onClick={() => setOpen(false)}>إغلاق</Button>
          {active ? state.canManage && <Button variant="destructive" loading={state.busy} disabled={reference.trim().length < 3 || !state.loaded} onClick={() => run(() => gradingApi.cancelCompensation(active.id, reference))}>إلغاء التعويض إداريًا</Button>
            : pending && <Button loading={state.busy} disabled={!state.loaded || disabled} onClick={() => run(() => gradingApi.compensateDay({ studentId, date: chosenDate, excuseReference: 'استئذان معتمد في النظام', scope }))}>تسجيل التعويض</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
