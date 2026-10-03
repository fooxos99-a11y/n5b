import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import NarrationCreateDialog from '@/components/dashboard/NarrationCreateDialog';
import DashboardMobileHeaderActions from '@/components/dashboard/DashboardMobileHeaderActions';
import NarrationStudentPanel from '@/components/dashboard/NarrationStudentPanel';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { FormField, ManagementEmpty, ManagementPanel } from '@/components/dashboard/layout/ManagementPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  commitOfflineOperation,
  loadOfflineSnapshot,
  syncOfflineActions,
} from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import { isMistakeMark } from '../../../shared/recitation-mark-types.js';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

const controlClassName = 'h-11 w-full min-w-0';
const dialogClassName = 'bg-card [font-family:var(--font-ui)]';
const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);
const summarizeStudents = (students = []) => ({
  total: students.length,
  completed: students.filter((student) => student.status === 'completed').length,
  inProgress: students.filter((student) => student.status === 'in_progress').length,
});

const NarrationDaySection = () => {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [event, setEvent] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [archiveId, setArchiveId] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [endScope, setEndScope] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEvent = useCallback(async (id) => {
    if (!id) { setEvent(null); return; }
    setIsLoading(true);
    try {
      setEvent(await loadOfflineSnapshot(
        getAccountId(),
        `narration:event:${id}`,
        () => studentsApi.getNarrationEvent(id),
      ));
    }
    catch (error) { toast({ title: 'تعذر تحميل يوم السرد', description: error.message, variant: 'destructive' }); }
    finally { setIsLoading(false); }
  }, [toast]);

  const load = useCallback(async (preferredId = '') => {
    setIsLoading(true);
    try {
      const [rows, committeeRows] = await Promise.all([
        loadOfflineSnapshot(getAccountId(), 'narration:events', () => studentsApi.getNarrationEvents()),
        loadOfflineSnapshot(getAccountId(), 'narration:committees', () => studentsApi.getCommittees()),
      ]);
      setEvents(rows);
      setCommittees(committeeRows);
      const nextId = preferredId || rows.find((item) => item.status === 'open')?.id || '';
      const selected = rows.find((item) => String(item.id) === String(nextId));
      setArchiveId(selected?.status === 'archived' ? String(nextId) : '');
      if (nextId) await loadEvent(nextId); else setEvent(null);
    } catch (error) {
      toast({ title: 'تعذر تحميل أيام السرد', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [loadEvent, toast]);

  useEffect(() => { load(); }, [load]);

  const archivedEvents = events.filter((item) => item.status === 'archived');
  const activeStudents = useMemo(
    () => (event?.students || []).filter((student) => event?.status === 'archived' || !student.archivedAt),
    [event]
  );
  const eventCommittees = useMemo(() => {
    const items = new Map();
    activeStudents.forEach((student) => {
      if (student.committeeId && !items.has(String(student.committeeId))) {
        items.set(String(student.committeeId), student.committeeName || 'حلقة بلا اسم');
      }
    });
    return [...items.entries()].map(([id, name]) => ({ id, name }));
  }, [activeStudents]);
  const narrationSummary = useMemo(() => summarizeStudents(activeStudents), [activeStudents]);
  const createEvent = async (form) => {
    setIsSaving(true);
    try {
      const result = await studentsApi.createNarrationEvent({
        ...form,
        scope: form.committeeIds.includes('all') ? 'all' : 'committee',
        committeeIds: form.committeeIds.includes('all') ? [] : form.committeeIds,
      });
      setArchiveId('');
      toast({ title: 'فُتح يوم السرد', description: `أضيف ${result.studentsCount} طالب وجارٍ إرسال رسالة البداية.` });
      try {
        const rows = await studentsApi.getNarrationEvents();
        setEvents(rows);
        await loadEvent(result.id);
      } catch (error) {
        toast({ title: 'فُتح السرد، وتعذر تحديث القائمة', description: error.message, variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const refreshEvent = async () => {
    if (!event?.id) return;
    try {
      setEvent(await loadOfflineSnapshot(
        getAccountId(),
        `narration:event:${event.id}`,
        () => studentsApi.getNarrationEvent(event.id),
      ));
    }
    catch (error) { toast({ title: 'تعذر تحديث يوم السرد', description: error.message, variant: 'destructive' }); }
  };
  const saveJuz = async (entryId, juzNumber, payload) => {
    try {
      if (!getAccountId()) {
        const result = await studentsApi.updateNarrationJuz(event.id, entryId, juzNumber, payload);
        await refreshEvent();
        toast({ title: 'حُفظ التقييم' });
        return result;
      }
      const action = await commitOfflineOperation(
        getAccountId(),
        'narration_juz',
        { eventId: event.id, entryId, juzNumber, evaluation: payload },
        { dedupeKey: `narration-juz:${event.id}:${entryId}:${juzNumber}` },
      );
      const marksByPart = new Map((payload.parts || []).map((item) => [String(item.partId), Array.isArray(item.wordMarks) ? item.wordMarks : []]));
      const allMarks = [...marksByPart.values()].flat();
      const hesitationCount = payload.evaluationMode === 'mushaf' ? allMarks.filter(mark => mark.markType === 'hesitation').length : Number(payload.hesitationCount || 0);
      const warningCount = payload.evaluationMode === 'mushaf'
        ? allMarks.filter((mark) => mark.markType === 'warning').length
        : Number(payload.warningCount || 0);
      const mistakeCount = payload.evaluationMode === 'mushaf'
        ? allMarks.filter((mark) => isMistakeMark(mark.markType)).length
        : Number(payload.mistakeCount || 0);
      const policy = event.evaluationPolicy || {};
      const localScore = Math.max(0, Number(policy.maxScore || 100)
        - hesitationCount * Number(policy.hesitationDeduction || 0)
        - warningCount * Number(policy.warningDeduction || 0)
        - mistakeCount * Number(policy.mistakeDeduction || 0));
      setEvent((current) => ({
        ...current,
        students: current.students.map((student) => {
          if (String(student.id) !== String(entryId)) return student;
          const juzParts = student.parts.filter((part) => Number(part.juzNumber) === Number(juzNumber));
          const firstPartId = String(juzParts[0]?.id);
          const parts = student.parts.map((part) => {
            if (Number(part.juzNumber) !== Number(juzNumber)) return part;
            const partMarks = marksByPart.get(String(part.id)) || [];
            const isFirst = String(part.id) === firstPartId;
            return {
              ...part,
              score: localScore,
              hesitationCount: payload.evaluationMode === 'mushaf' ? partMarks.filter(mark => mark.markType === 'hesitation').length : (isFirst ? hesitationCount : 0),
              warningCount: payload.evaluationMode === 'mushaf' ? partMarks.filter((mark) => mark.markType === 'warning').length : (isFirst ? warningCount : 0),
              mistakeCount: payload.evaluationMode === 'mushaf' ? partMarks.filter((mark) => isMistakeMark(mark.markType)).length : (isFirst ? mistakeCount : 0),
              wordMarks: partMarks,
              pendingSync: true,
            };
          });
          return { ...student, parts, status: parts.every((part) => part.score !== null && part.score !== undefined) ? 'completed' : 'in_progress' };
        }),
      }));
      const synced = navigator.onLine === false
        ? null
        : (await syncOfflineActions(getAccountId(), { force: true })).find((item) => item.actionId === action.actionId);
      if (synced?.status?.startsWith('rejected_')) throw new Error(synced.lastError || 'رفض السيرفر تقييم السرد.');
      if (synced?.status === 'synced') await refreshEvent();
      toast({ title: synced?.status === 'synced' ? 'حُفظ التقييم' : 'حُفظ التقييم محليًا' });
      return synced?.result || { ok: true, score: localScore, pendingSync: true };
    }
    catch (error) { toast({ title: 'تعذر حفظ التقييم', description: error.message, variant: 'destructive' }); throw error; }
  };
  const startStudent = async (entryId) => {
    try {
      if (!getAccountId()) {
        const result = await studentsApi.updateNarrationStudentStatus(event.id, entryId, 'in_progress');
        await refreshEvent();
        return result;
      }
      const action = await commitOfflineOperation(
        getAccountId(),
        'narration_student_status',
        { eventId: event.id, entryId, status: 'in_progress' },
        { dedupeKey: `narration-status:${event.id}:${entryId}` },
      );
      setEvent((current) => ({
        ...current,
        students: current.students.map((student) => String(student.id) === String(entryId)
          ? { ...student, status: student.status === 'completed' ? 'completed' : 'in_progress', reciterNames: [...new Set([...(student.reciterNames || []), localStorage.getItem('wajeh_name')].filter(Boolean))], pendingSync: true }
          : student),
      }));
      if (navigator.onLine !== false) {
        await syncOfflineActions(getAccountId(), { force: true });
        await refreshEvent();
      }
      return action;
    }
    catch (error) { toast({ title: 'تعذر بدء التسميع', description: error.message, variant: 'destructive' }); }
  };
  const endNarration = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      if (getAccountId()) {
        const synced = await syncOfflineActions(getAccountId(), { force: true });
        if (synced.some(action => String(action.payload?.eventId) === String(event.id) && action.status !== 'synced')) {
          throw new Error('تعذر مزامنة بعض التقييمات. أعد المحاولة قبل إنهاء يوم السرد.');
        }
      }
      const result = await studentsApi.archiveNarrationEvent(event.id, {
        committeeId: endScope === 'all' ? null : endScope,
      });
      setEndOpen(false);
      toast({
        title: result.archivedAll ? 'تم إنهاء يوم السرد' : 'تم إنهاء سرد الحلقة',
      });
      if (result.archivedAll) await load(); else await refreshEvent();
    } catch (error) {
      toast({ title: 'تعذر إنهاء يوم السرد', description: error.message, variant: 'destructive' });
    } finally {
      setIsEnding(false);
    }
  };

  const selectArchive = (value) => {
    setArchiveId(value);
    setArchiveOpen(false);
    loadEvent(value);
  };

  const returnToCurrent = () => {
    setArchiveId('');
    load();
  };

  const deleteArchive = async () => {
    if (!archiveId || event?.status !== 'archived') return;
    setIsDeleting(true);
    try {
      await studentsApi.deleteNarrationEvent(archiveId);
      setDeleteOpen(false);
      setArchiveId('');
      toast({ title: 'تم حذف الأرشيف' });
      await load();
    } catch (error) {
      toast({ title: 'تعذر حذف الأرشيف', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const openEndDialog = () => {
    setEndScope('all');
    setEndOpen(true);
  };

  const _resolveNarrationDaySection = () => {
    if (isSaving || isLoading) {
      return <div className="flex min-h-[420px] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
            <DashboardLoader className="min-h-24" />
            <p className="font-black text-primary [font-family:var(--font-ui)]">جاري تحميل يوم السرد</p>
          </div>;
    }
    if (!event) {
      return <ManagementEmpty>لا يوجد يوم سرد مفتوح.</ManagementEmpty>;
    }
    return <div className="divide-y divide-border">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0">
                <div className="truncate text-lg font-black text-foreground">{event.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{formatHijriDate(event.startDate)} إلى {formatHijriDate(event.endDate)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm font-black">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />{activeStudents.length}</span>
                <span className="flex items-center gap-1.5 text-primary"><CheckCircle2 className="h-4 w-4" />{activeStudents.filter((student) => student.status === 'completed').length}</span>
                {archiveId && event.status === 'archived' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    حذف الأرشيف
                  </Button>
                )}
              </div>
            </div>

            {event.status === 'archived' && (
              <dl className="grid grid-cols-3 gap-y-4 p-4 sm:p-6 xl:grid-cols-3">
                {[
                  { label: 'إجمالي الطلاب', value: narrationSummary.total, className: 'text-primary' },
                  { label: 'أكمل', value: narrationSummary.completed, className: 'text-emerald-500' },
                  { label: 'لم يكمل', value: narrationSummary.inProgress, className: 'text-amber-500' },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <dt className="text-xs font-black text-muted-foreground">{item.label}</dt>
                    <dd className={`mt-1 text-2xl font-black tabular-nums ${item.className}`}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {activeStudents.length ? (
              <ul aria-label="طلاب يوم السرد" className="divide-y divide-border">
                {activeStudents.map((student) => (
                  <NarrationStudentPanel
                    key={student.id}
                    eventId={event.id}
                    student={student}
                    archived={event.status === 'archived'}
                    maxScore={event.evaluationPolicy?.maxScore ?? 100}
                    onSaveJuz={saveJuz}
                    onStart={startStudent}
                  />
                ))}
              </ul>
            ) : (
              <ManagementEmpty>لا يوجد طلاب مطابقون.</ManagementEmpty>
            )}
          </div>;
  };
  return (
    <>
      <DashboardMobileHeaderActions>
        <div className="flex items-center gap-1.5 sm:gap-2" dir="rtl">
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3"
            aria-label="فتح يوم سرد"
            title="فتح يوم سرد"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">فتح</span>
          </Button>
          {archiveId && events.some((item) => item.status === 'open') && (
            <Button type="button" variant="outline" onClick={returnToCurrent} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="العودة للسرد الحالي" title="العودة للسرد الحالي">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden lg:inline">السرد الحالي</span>
            </Button>
          )}
          {event?.status === 'open' && (
            <Button type="button" variant="destructive" onClick={openEndDialog} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="إنهاء يوم السرد" title="إنهاء يوم السرد">
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden lg:inline">إنهاء</span>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setArchiveOpen(true)} disabled={!archivedEvents.length} className="h-11 w-11 gap-2 px-0 sm:w-auto sm:px-3" aria-label="أرشيف أيام السرد" title="أرشيف أيام السرد">
            <Archive className="h-4 w-4" />
            <span className="hidden lg:inline">الأرشيف</span>
          </Button>
        </div>
      </DashboardMobileHeaderActions>

      <ManagementPanel>
        {events.filter(item => item.status === 'open').length > 1 && <div className="p-4">
          <Select value={event?.status === 'open' ? String(event.id) : ''} onValueChange={id => { setArchiveId(''); loadEvent(id); }}>
            <SelectTrigger aria-label="يوم السرد المفتوح"><SelectValue placeholder="اختر يوم السرد" /></SelectTrigger>
            <SelectContent>{events.filter(item => item.status === 'open').map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {formatHijriDate(item.startDate)}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        {_resolveNarrationDaySection()}
      </ManagementPanel>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className={`max-h-[85vh] overflow-y-auto ${dialogClassName}`} dir="rtl">
          <DialogHeader><DialogTitle>أرشيف أيام السرد</DialogTitle></DialogHeader>
          <ul aria-label="أرشيف أيام السرد" className="-mx-2 divide-y divide-border">
            {archivedEvents.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectArchive(String(item.id))}
                  className="block min-h-11 w-full rounded-lg px-2 py-3 text-right transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="font-bold text-foreground">{item.name}</div>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <NarrationCreateDialog open={createOpen} onOpenChange={setCreateOpen} committees={committees} onCreate={createEvent} />

      <Dialog open={endOpen} onOpenChange={(value) => { if (!isEnding) setEndOpen(value); }}>
        <DialogContent className={dialogClassName} dir="rtl">
          <DialogHeader><DialogTitle>إنهاء يوم السرد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="حدد الحلقات المراد إنهاء السرد عليها">
              <Select value={endScope} onValueChange={setEndScope} disabled={isEnding}>
                <SelectTrigger aria-label="الحلقات المراد إنهاء السرد عليها" className={controlClassName}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحلقات</SelectItem>
                  {eventCommittees.map((committee) => <SelectItem key={committee.id} value={committee.id}>{committee.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>

          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isEnding} onClick={() => setEndOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={endNarration} loading={isEnding}>{isEnding ? 'جاري إنهاء يوم السرد' : 'إنهاء يوم السرد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={dialogClassName} dir="rtl">
          <DialogHeader><DialogTitle>حذف الأرشيف</DialogTitle></DialogHeader>
          <p className="py-2 font-bold text-muted-foreground">هل تريد حذف أرشيف {event?.name} نهائيًا؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={deleteArchive} disabled={isDeleting}>حذف الأرشيف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NarrationDaySection;
