import React, { useCallback, useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

export default function StudentPlansPauseControl({ onChange }) {
  const { toast } = useToast();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const load = useCallback(async () => {
    setLoadError('');
    try { setState(await studentsApi.getStudentPlanPause()); }
    catch (error) { setLoadError(error.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const updated = await studentsApi.setStudentPlanPause({ paused: !state.paused, revision: state.revision });
      setState(updated);
      setOpen(false);
      toast({ title: updated.paused ? 'تم إيقاف الخطط' : 'تم تشغيل الخطط' });
      await onChange?.();
    } catch (error) {
      setSaveError(error.message);
      if (error.status === 409) { setOpen(false); await load(); }
    } finally { setSaving(false); }
  };
  if (loadError) return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
    <span>تعذر تحميل حالة الخطط.</span><Button type="button" variant="outline" onClick={load}>إعادة المحاولة</Button>
  </div>;
  if (!state) return <Button type="button" variant="outline" disabled loading>حالة الخطط</Button>;
  return <>
    {state.paused && <span className="text-sm font-bold text-muted-foreground" role="status">الخطط متوقفة منذ {formatHijriDate(state.pausedFrom)}</span>}
    {saveError && !open && <p role="alert" className="basis-full text-sm text-destructive">{saveError}</p>}
    {state.canManage && <Button type="button" variant="outline" className="h-11 shrink-0 gap-2" onClick={() => { setSaveError(''); setOpen(true); }}>
      {state.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {state.paused ? 'تشغيل الخطط' : 'إيقاف الخطط'}
    </Button>}
    <Dialog open={open} onOpenChange={value => !saving && setOpen(value)}>
      <DialogContent dir="rtl" className="max-w-md [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{state.paused ? 'تشغيل الخطط' : 'إيقاف الخطط'}</DialogTitle></DialogHeader>
        <p className="text-sm leading-7 text-muted-foreground">{state.paused
          ? 'تستأنف جميع خطط الطلاب من اليوم، وتكمل من تقدمها السابق.'
          : 'تتوقف جميع خطط الطلاب من اليوم. لا يُحتسب إنجاز أو تعثر جديد خلال الإيقاف، ويتغير تاريخ الانتهاء المتوقع.'}</p>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>إلغاء</Button>
          <Button type="button" loading={saving} onClick={save}>{state.paused ? 'تشغيل الخطط' : 'إيقاف الخطط'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
