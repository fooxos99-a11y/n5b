import CallRoomList from './CallRoomList';
import CallRoomCards from './CallRoomCards';
import { subscribeCallDirectory } from '@/services/callDirectory';
import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { FormField, FormGrid, ManagementEmpty, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const CallsSection = ({ onJoinRoom, embedded = false }) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState('');
  const [committees, setCommittees] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canCreateGeneral, setCanCreateGeneral] = useState(false);
  const [committeeSelectionLocked, setCommitteeSelectionLocked] = useState(false);
  const [livekitConfigured, setLivekitConfigured] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: '', committeeId: '' });

  const applyDirectory = useCallback(data => {
    setLoadError('');
    setRooms((data.rooms || []).filter((room) => room.status === 'open'));
    setCommittees(data.committees || []);
    setCanCreate(Boolean(data.canCreate));
    setCanCreateGeneral(Boolean(data.canCreateGeneral));
    setCommitteeSelectionLocked(Boolean(data.committeeSelectionLocked));
    setLivekitConfigured(data.livekitConfigured === true);
    setForm((current) => ({ ...current, committeeId: current.committeeId || String(data.committees?.[0]?.id || '') }));
    setLiveError('');
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const data = await studentsApi.getCallRooms();
      applyDirectory(data);
    } catch (error) {
      if (!quiet) setLoadError(error.message || 'تعذر تحميل الغرف.');
      if (!quiet) toast({ title: 'تعذر تحميل الغرف', description: error.message, variant: 'destructive' });
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [applyDirectory, toast]);

  useEffect(() => {
    let canceled = false, stop;
    load().then(() => {
      if (!canceled) stop = subscribeCallDirectory({ onData: applyDirectory, onError: error => {
        setLiveError(error.message);
        if ([401, 403].includes(error.status)) { setRooms([]); setLoadError(error.message); }
      } });
    });
    return () => { canceled = true; stop?.(); };
  }, [applyDirectory, load]);

  const createRoom = async () => {
    if (!form.name.trim() || (committeeSelectionLocked && !form.committeeId)) return;
    setIsSaving(true);
    try {
      await studentsApi.createCallRoom(
        { ...form, committeeId: form.committeeId === 'general' ? null : form.committeeId }
      );
      setCreateOpen(false);
      setForm((current) => ({ ...current, name: '' }));
      await load();
      toast({ title: 'تم إنشاء غرفة المكالمة' });
    } catch (error) {
      toast({ title: 'تعذر إنشاء الغرفة', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const normalizedSearch = search.trim().toLocaleLowerCase('ar');
  const visibleRooms = rooms.filter(room => [room.name, room.committeeName, ...(room.participants || []).map(person => person.name)].some(value => String(value || '').toLocaleLowerCase('ar').includes(normalizedSearch)));
  const _resolveCallsSection = () => {
    if (isLoading) {
      return <DashboardLoader className="min-h-[320px]" />;
    }
    if (loadError) return <ErrorState message={loadError} onRetry={() => load()} />;
    if (!livekitConfigured) return <ManagementEmpty>المكالمات غير متاحة حاليًا.</ManagementEmpty>;
    if (rooms.length === 0) {
      return <ManagementEmpty>لا توجد غرف مفتوحة حاليًا.</ManagementEmpty>;
    }
    if (!visibleRooms.length) return <ManagementEmpty>لا توجد مكالمات مطابقة للبحث.</ManagementEmpty>;
    return <>{liveError && <p role="status" className="px-4 py-3 text-sm text-destructive sm:px-6">{liveError}</p>}{embedded ? <div className="p-4 sm:p-6"><CallRoomCards rooms={visibleRooms} onJoinRoom={onJoinRoom} /></div> : <CallRoomList rooms={visibleRooms} onJoinRoom={onJoinRoom} />}</>;
  };
  const Container = embedded ? 'section' : ManagementPanel;
  return (
    <Container className={embedded ? '[font-family:var(--font-ui)]' : undefined} dir="rtl">
      {(!embedded || canCreate) && <ManagementToolbar className="flex-nowrap">
        {!embedded && <Input type="search" aria-label="ابحث في المكالمات" placeholder="ابحث في المكالمات" value={search} onChange={event => setSearch(event.target.value)} className="h-11 min-w-0 flex-1 basis-0" />}
        {canCreate && <>
        <Button onClick={() => setCreateOpen(true)} disabled={!livekitConfigured || (committeeSelectionLocked && committees.length === 0)} className="h-11 shrink-0 gap-2 px-3 sm:px-5">
          <Plus className="h-4 w-4" /> إنشاء غرفة
        </Button>
        </>}
      </ManagementToolbar>}
      {_resolveCallsSection()}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء غرفة مكالمة</DialogTitle></DialogHeader>
          <FormGrid className="py-2 sm:grid-cols-1">
            <FormField label="اسم الغرفة" htmlFor="call-room-name"><Input id="call-room-name" aria-label="اسم الغرفة" value={form.name} maxLength={180} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: تسميع المجموعة الأولى" /></FormField>
            {!committeeSelectionLocked && (committees.length > 0 || canCreateGeneral) && <div className="min-w-0"><FormField label="الحلقة" htmlFor="call-room-committee"><Select value={form.committeeId} onValueChange={(value) => setForm({ ...form, committeeId: value })}><SelectTrigger id="call-room-committee" aria-label="الحلقة" className="h-11"><SelectValue placeholder="غرفة عامة" /></SelectTrigger><SelectContent>{canCreateGeneral && <SelectItem value="general">غرفة عامة</SelectItem>}{committees.map((committee) => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>)}</SelectContent></Select></FormField></div>}
          </FormGrid>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button onClick={createRoom} disabled={isSaving || !form.name.trim() || (committeeSelectionLocked && !form.committeeId)}>إنشاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default CallsSection;
