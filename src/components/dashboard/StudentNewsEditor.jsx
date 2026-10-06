import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { ManagementEmpty, ManagementList, ManagementPanel, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import DashboardLoader from './DashboardLoader';
import { studentNewsService } from '@/services/studentNewsService';
import { emptyStudentNews, newsTimeNow } from '../../../shared/student-news';
import { isActionCancelled } from '@/lib/deferredActions';
import { useToast } from '@/components/ui/use-toast';
import NewsEntryDialog from './NewsEntryDialog';
import { hijriMonthRange, parseDateOnly } from '../../../shared/hijri-calendar.js';

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
  const [search, setSearch] = useState('');
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
  const createEntry = () => {
    const startsAt = newsTimeNow().slice(0, 10);
    const endsAt = hijriMonthRange(parseDateOnly(startsAt)).to;
    setEditing({ id: crypto.randomUUID(), title: '', image: '', committeeIds: [], startsAt, endsAt, enabled: true });
  };
  const now = newsTimeNow();
  const actionClass = 'h-11 w-11 border-transparent bg-transparent';
  const normalizedSearch = search.trim().toLocaleLowerCase('ar');
  const visibleEntries = news.entries.filter(entry => [entry.title, entry.body].some(value => String(value || '').toLocaleLowerCase('ar').includes(normalizedSearch)));
  return <ManagementPanel>
    <ManagementToolbar className="flex-nowrap">
      <Input type="search" aria-label="ابحث في الأخبار" placeholder="ابحث في الأخبار" value={search}
        onChange={event => setSearch(event.target.value)} className="h-11 min-w-0 flex-1 basis-0" />
      <Button className="h-11 shrink-0 gap-2 px-3 sm:px-5" disabled={!loaded || pending || news.entries.length >= 8} onClick={createEntry}><Plus className="h-4 w-4" />إضافة خبر</Button>
    </ManagementToolbar>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm text-destructive sm:px-6"><p>{error}</p><Button variant="ghost" className="h-11" disabled={pending} onClick={() => setRetry(value => value + 1)}>إعادة التحميل</Button></div>}
    {loading ? <DashboardLoader /> : visibleEntries.length ? <ManagementList label="الأخبار">
      {visibleEntries.map(entry => <ManagementRow key={entry.id} title={entry.title}
        icon={entry.image ? <img src={entry.image} alt="" className="h-4 w-4 shrink-0 rounded bg-muted/30 object-cover" /> : null}
        subtitle={`${audienceLabel(entry, committees)}، ${displayStatus(entry, now)}`}
        onOpen={() => setEditing(entry)} openLabel={`تعديل ${entry.title}`} disabled={pending}
        actions={<>
          <ManagementIconButton className={actionClass} tone="primary" disabled={pending} onClick={() => setEditing(entry)} title="تعديل" aria-label={`تعديل ${entry.title}`}><Pencil className="h-4 w-4" /></ManagementIconButton>
          <ManagementIconButton className={actionClass} tone="destructive" disabled={pending} onClick={() => remove(entry.id)} title="حذف" aria-label={`حذف ${entry.title}`}><Trash2 className="h-4 w-4" /></ManagementIconButton>
        </>} />)}
    </ManagementList> : loaded ? <ManagementEmpty>{normalizedSearch ? 'لا توجد أخبار مطابقة للبحث.' : 'لا توجد أخبار حاليًا.'}</ManagementEmpty> : null}
    {editing && <NewsEntryDialog key={editing.id} entry={editing} committees={committees} pending={pending} onClose={() => setEditing(null)} onSave={save} />}
  </ManagementPanel>;
}
