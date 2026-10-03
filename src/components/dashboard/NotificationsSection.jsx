import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MessageComposer from '@/components/dashboard/MessageComposer';
import { useSiteConfig } from '@/site/SiteProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import MessageRecipientFilters from '@/components/dashboard/MessageRecipientFilters';
import NotificationRecipients, { isNotificationRecipientSelected, recipientRoleLabels } from '@/components/notifications/NotificationRecipients';
import { studentsApi } from '@/services/studentsApi';
import { formatHijriDateTime } from '../../../shared/hijri-calendar.js';

const emptySelection = () => ({ roles: [], committeeIds: [], people: [] });
export default function NotificationsSection() {
  const site = useSiteConfig();
  const { toast } = useToast();
  const [audience, setAudience] = useState({ people: [], committees: [] });
  const [history, setHistory] = useState([]);
  const [selection, setSelection] = useState(emptySelection);
  const [recipientType, setRecipientType] = useState('student');
  const [committeeId, setCommitteeId] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState(null);
  const pendingRequest = useRef(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextAudience, nextHistory] = await Promise.all([studentsApi.getNotificationAudience(), studentsApi.getNotificationHistory()]);
      setAudience(nextAudience); setHistory(nextHistory);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      void studentsApi.getNotificationHistory().then(setHistory).catch((e) => setError(e.message));
    };
    const timer = window.setInterval(refresh, 20000);
    return () => window.clearInterval(timer);
  }, []);
  const count = audience.people.filter((person) => isNotificationRecipientSelected(person, selection)).length;
  const visibleRecipients = audience.people.filter((person) => person.role === recipientType
    && (recipientType !== 'student' || committeeId === 'all' || String(person.committeeId) === committeeId));
  const changeRecipientType = (role) => { setRecipientType(role); setCommitteeId('all'); setSelection(emptySelection()); };
  const changeCommittee = (id) => {
    setCommitteeId(id);
    const visibleKeys = new Set(audience.people.filter((person) => person.role === recipientType && (id === 'all' || String(person.committeeId) === id)).map((person) => `${person.role}:${person.id}`));
    setSelection((current) => ({ ...current, people: current.people.filter((key) => visibleKeys.has(key)) }));
  };
  const send = async () => {
    if (busy.current || !count || !body.trim()) return;
    busy.current = true; setSending(true);
    const payload = { title: site.name, body: body.trim(), selection };
    const fingerprint = JSON.stringify(payload);
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await studentsApi.sendNotification({ ...payload, requestId: pendingRequest.current.id });
      pendingRequest.current = null;
      setBody(''); setSelection(emptySelection());
      toast({ title: 'أُرسل الإشعار داخل التطبيق' });
      await load();
    } catch (e) { toast({ title: 'تعذر الإرسال', description: e.message, variant: 'destructive' }); }
    finally { busy.current = false; setSending(false); }
  };
  const showRecipients = async (id) => {
    setRecipients({ loading: true, rows: [] });
    try { setRecipients({ loading: false, rows: await studentsApi.getNotificationRecipients(id) }); }
    catch (e) { setRecipients(null); toast({ title: 'تعذر تحميل المستلمين', description: e.message, variant: 'destructive' }); }
  };
  const _resolveConditional = () => {
    if (loading) {
      return <DashboardLoader />;
    }
    if (error) {
      return <ManagementPanel><div role="alert" className="space-y-3 p-4 sm:p-6"><p>{error}</p><Button onClick={load} className="h-11">إعادة المحاولة</Button></div></ManagementPanel>;
    }
    return <>
        <ManagementPanel>
          <fieldset disabled={sending} className="min-w-0">
          <ManagementToolbar>
            <MessageRecipientFilters recipientType={recipientType} onRecipientTypeChange={changeRecipientType} roles={Object.entries(recipientRoleLabels).map(([value, label]) => ({ value, label }))} committeeId={committeeId} onCommitteeChange={changeCommittee} committees={audience.committees} showCommittees={recipientType === 'student'}>
              <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" title="الإشعارات المرسلة" aria-label="الإشعارات المرسلة" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /></Button>
            </MessageRecipientFilters>
          </ManagementToolbar>
          <div className="divide-y divide-border">
            <div className="p-4 sm:p-6">
              <MessageComposer value={body} onChange={setBody} onSend={send} sending={sending} disabled={!count || !body.trim()} maxLength={4000} placeholder="اكتب الرسالة هنا..." />
            </div>
            <div className="p-4 sm:p-6">
              <NotificationRecipients people={visibleRecipients} value={selection} onChange={setSelection} count={count} />
            </div>
          </div>
          </fieldset>
        </ManagementPanel>
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto [font-family:var(--font-ui)]"><DialogHeader><DialogTitle>الإشعارات المرسلة</DialogTitle></DialogHeader><div className="divide-y divide-border">
          {!history.length && <p className="text-muted-foreground">لا توجد إشعارات مرسلة.</p>}
          {history.map((item) => <article key={item.id} className="space-y-2 py-3">
            <h3 className="break-words font-bold">{item.title}</h3><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
            <p className="text-xs text-muted-foreground">{formatHijriDateTime(item.createdAt)} · {item.createdBy}</p>
            <p className="text-xs text-muted-foreground">إرسال الأجهزة: {item.pushSent || 0} · بانتظار الإرسال: {item.pushPending || 0} · تعذر الإرسال: {item.pushFailed || 0}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm"><span>أُرسل داخل التطبيق: {item.recipientCount}</span><span>قُرئ: {item.readCount}</span><Button variant="outline" className="min-h-11" onClick={() => showRecipients(item.id)}>المستلمون</Button></div>
          </article>)}
        </div></DialogContent></Dialog>
      </>;
  };
  return (
    <div className="space-y-4 [font-family:var(--font-ui)]" dir="rtl">
      {_resolveConditional()}
      <Dialog open={recipients !== null} onOpenChange={(open) => { if (!open) setRecipients(null); }}><DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto [font-family:var(--font-ui)]"><DialogHeader><DialogTitle>المستلمون</DialogTitle></DialogHeader>
        {recipients?.loading ? <DashboardLoader /> : recipients?.rows.map((person) => <div key={`${person.role}:${person.id}`} className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm"><span>{person.name} · {recipientRoleLabels[person.role]}</span><span>{person.readAt ? 'قُرئ' : 'لم يُقرأ'}</span></div>)}
      </DialogContent></Dialog>
    </div>
  );
}
