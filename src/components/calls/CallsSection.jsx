import React, { useCallback, useEffect, useState } from 'react';
import { Headphones, PhoneCall, Plus, Users } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const CallsSection = ({ onJoinRoom, embedded = false }) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canCreateGeneral, setCanCreateGeneral] = useState(false);
  const [committeeSelectionLocked, setCommitteeSelectionLocked] = useState(false);
  const [livekitConfigured, setLivekitConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: '', committeeId: '' });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const data = await studentsApi.getCallRooms();
      setRooms((data.rooms || []).filter((room) => room.status === 'open'));
      setCommittees(data.committees || []);
      setCanCreate(Boolean(data.canCreate));
      setCanCreateGeneral(Boolean(data.canCreateGeneral));
      setCommitteeSelectionLocked(Boolean(data.committeeSelectionLocked));
      setLivekitConfigured(data.livekitConfigured !== false);
      setForm((current) => ({ ...current, committeeId: current.committeeId || String(data.committees?.[0]?.id || '') }));
    } catch (error) {
      if (!quiet) toast({ title: 'تعذر تحميل الغرف', description: error.message, variant: 'destructive' });
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ quiet: true }), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

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

  const _resolveCallsSection = () => {
    if (isLoading) {
      return <DashboardLoader className="min-h-[320px]" />;
    }
    if (rooms.length === 0) {
      return <ManagementEmpty>لا توجد غرف مفتوحة حاليًا.</ManagementEmpty>;
    }
    return <ManagementList label="غرف المكالمات">
            {rooms.map((room) => (
              <li key={room.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-nowrap sm:px-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Headphones className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-foreground">{room.name}</h3>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground"><span className="font-bold text-primary">{room.committeeName}</span> · أنشأها: {room.createdByName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-4 w-4" /> سبق لهم الدخول: {room.participantNames?.length || 0}</p>
                </div>
                <Button onClick={() => onJoinRoom?.(room)} disabled={!livekitConfigured} className="h-11 w-full shrink-0 gap-2 sm:w-auto"><PhoneCall className="h-4 w-4" /> دخول المكالمة</Button>
              </li>
            ))}
          </ManagementList>;
  };
  const Container = embedded ? 'section' : ManagementPanel;
  return (
    <Container className={embedded ? '[font-family:var(--font-ui)]' : undefined} dir="rtl">
      {canCreate && <ManagementToolbar>
        <Button onClick={() => setCreateOpen(true)} disabled={!livekitConfigured || (committeeSelectionLocked && committees.length === 0)} className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" /> إنشاء غرفة
        </Button>
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
