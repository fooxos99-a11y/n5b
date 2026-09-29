import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { studentNewsService } from '@/services/studentNewsService';
import { emptyStudentNews, newsTimeNow } from '../../../shared/student-news';
import { isActionCancelled } from '@/lib/deferredActions';
import { useToast } from '@/components/ui/use-toast';
import NewsEntryDialog from './NewsEntryDialog';

function audienceLabel(entry, committees) {
  if (entry.legacyStudentIds?.length) return 'تخصيص سابق';
  if (!entry.committeeIds.length) return 'جميع الحلقات';
  return committees.filter(row => entry.committeeIds.includes(Number(row.id))).map(row => row.name).join('، ');
}

function displayStatus(entry, now) {
  if (entry.enabled === false) return 'مخفي';
  if (entry.endsAt && entry.endsAt < now) return 'انتهى العرض';
  if (entry.startsAt && entry.startsAt > now) return 'مجدول';
  return 'معروض';
}

export default function StudentNewsEditor() {
  const { toast } = useToast();
  const [news, setNews] = useState(emptyStudentNews);
  const [committees, setCommittees] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setLoaded(false); setError('');
    Promise.all([studentNewsService.manage(), studentNewsService.audience()]).then(([value, rows]) => {
      if (active) { setNews(value); setCommittees(rows); setLoaded(true); }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const persist = async entries => {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError('');
    try { setNews(await studentNewsService.save({ entries, revision: news.revision })); return true; }
    catch (reason) {
      if (isActionCancelled(reason)) {
        return false;
      }
      throw reason;
    }
    finally { busy.current = false; setPending(false); }
  };
  const save = async entry => {
    const exists = news.entries.some(row => row.id === entry.id);
    const entries = exists ? news.entries.map(row => row.id === entry.id ? entry : row) : [...news.entries, entry];
    if (await persist(entries)) { setEditing(null); toast({ title: 'حُفظ الخبر' }); }
  };
  const remove = async id => {
    try { await persist(news.entries.filter(entry => entry.id !== id)); }
    catch (reason) { setError(reason.message); }
  };
  if (loading) return <LoadingIndicator />;
  const createEntry = () => {
    const startsAt = newsTimeNow().slice(0, 10);
    const [year, month] = startsAt.split('-').map(Number);
    const endsAt = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    setEditing({ id: crypto.randomUUID(), title: '', image: '', committeeIds: [], startsAt, endsAt, enabled: true });
  };
  const now = newsTimeNow();
  const actionClass = 'h-11 w-11 border-transparent bg-transparent';
  return <ManagementPanel>
    <ManagementToolbar>
      <Button className="h-11 gap-2 px-5" disabled={!loaded || pending || news.entries.length >= 8} onClick={createEntry}><Plus className="h-4 w-4" />إضافة خبر</Button>
    </ManagementToolbar>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm text-destructive sm:px-6"><p>{error}</p><Button variant="ghost" className="h-11" disabled={pending} onClick={() => setRetry(value => value + 1)}>إعادة التحميل</Button></div>}
    <ManagementList label="الأخبار">
      {news.entries.map(entry => <li key={entry.id} className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
        {entry.image && <img src={entry.image} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-muted/30 object-cover sm:h-20 sm:w-20" />}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="break-words text-base font-bold text-foreground">{entry.title}</h3>
          <p className="text-sm text-muted-foreground">{audienceLabel(entry, committees)}</p>
          <p className="text-sm text-muted-foreground">{displayStatus(entry, now)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ManagementIconButton className={actionClass} tone="primary" disabled={pending} onClick={() => setEditing(entry)} title="تعديل" aria-label={`تعديل ${entry.title}`}><Pencil className="h-4 w-4" /></ManagementIconButton>
          <ManagementIconButton className={actionClass} tone="destructive" disabled={pending} onClick={() => remove(entry.id)} title="حذف" aria-label={`حذف ${entry.title}`}><Trash2 className="h-4 w-4" /></ManagementIconButton>
        </div>
      </li>)}
    </ManagementList>
    {editing && <NewsEntryDialog key={editing.id} entry={editing} committees={committees} pending={pending} onClose={() => setEditing(null)} onSave={save} />}
  </ManagementPanel>;
}
