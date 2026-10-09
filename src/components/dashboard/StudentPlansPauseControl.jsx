import React, { useCallback, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi, request } from '@/services/studentsApi';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

export default function StudentPlansPauseControl({ onChange, studentId = null, studentName = '', initialState = null }) {
  const { toast } = useToast();
  const [state, setState] = useState(initialState);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const load = useCallback(async () => {
    setLoadError('');
    try { setState(await (studentId ? request(`/student-plans/pause/${studentId}`) : studentsApi.getStudentPlanPause())); }
    catch (error) { setLoadError(error.message); }
  }, [studentId]);
  useEffect(() => { if (!studentId) load(); }, [load, studentId]);
  useEffect(() => { if (studentId) setState(initialState); }, [initialState, studentId]);
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = { paused: !state.paused, revision: state.revision };
      const updated = await (studentId ? request(`/student-plans/pause/${studentId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : studentsApi.setStudentPlanPause(payload));
      setState(updated);
      setOpen(false);
      toast({ title: updated.paused ? (studentId ? 'تم إيقاف خطة الطالب' : 'تم إيقاف الخطط') : (studentId ? 'تم استئناف خطة الطالب' : 'تم تشغيل الخطط') });
      await onChange?.();
    } catch (error) {
      setSaveError(error.message);
      if (error.status === 409) { setOpen(false); await load(); }
    } finally { setSaving(false); }
  };
  if (loadError) return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
    <span>تعذر تحميل حالة الخطط.</span><Button type="button" variant="outline" onClick={load}>إعادة المحاولة</Button>
  </div>;
  if (!state && studentId) return null;
  if (!state) return <Button type="button" variant="outline" disabled loading>حالة الخطط</Button>;
  const title = studentId ? (state.paused ? 'استئناف الخطة' : 'إيقاف الخطة') : (state.paused ? 'تشغيل الخطط' : 'إيقاف الخطط');
  return <>
    {state.paused && !studentId && <span className="text-sm font-bold text-muted-foreground" role="status">الخطط متوقفة منذ {formatHijriDate(state.pausedFrom)}</span>}
    {saveError && !open && <p role="alert" className="basis-full text-sm text-destructive">{saveError}</p>}
    {state.canManage && <Button type="button" variant="outline" aria-label={studentId ? `${title} — ${studentName}` : undefined} className="h-11 shrink-0 gap-2" onClick={() => { setSaveError(''); setOpen(true); }}>
      {state.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {title}
    </Button>}
    <Dialog open={open} onOpenChange={value => !saving && setOpen(value)}>
      <DialogContent dir="rtl" className="max-w-md [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{title}{studentId ? ` — ${studentName}` : ''}</DialogTitle></DialogHeader>
        {studentId ? <p className="text-sm leading-7 text-muted-foreground">{state.paused
          ? 'تستأنف خطة الطالب من تقدمها السابق عند عدم وجود إيقاف عام.'
          : 'تتوقف خطة الطالب من اليوم، ولا يُحتسب تعثر جديد خلال الإيقاف. يبقى الاجتياز متاحًا.'}</p> :
        <p className="text-sm leading-7 text-muted-foreground">{state.paused
          ? 'تستأنف الخطط من تقدمها السابق، وتبقى الخطط الموقوفة لطالب محدد متوقفة.'
          : 'تتوقف جميع خطط الطلاب من اليوم. لا يُحتسب إنجاز أو تعثر جديد خلال الإيقاف، ويتغير تاريخ الانتهاء المتوقع.'}</p>}
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>إلغاء</Button>
          <Button type="button" loading={saving} onClick={save}>{title}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
