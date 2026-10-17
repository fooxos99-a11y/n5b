import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementEmpty, ManagementList, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import CallArchiveSession from './CallArchiveSession';
import { callArchiveApi } from '@/services/callArchiveApi';
import { callArchiveLink, callDate, recordingLabel } from '@/lib/callArchivePresentation';

const initial = key => new URLSearchParams(window.location.search).get(key) || '';
export default function CallArchiveSection() {
  const [roomId, setRoomId] = useState(() => initial('callArchiveRoom')), [sessionId, setSessionId] = useState(() => initial('callSession'));
  const [data, setData] = useState(null), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    try { const result = roomId ? await callArchiveApi.room(roomId) : await callArchiveApi.rooms(); if (current === version.current) { setData(result); setError(''); } }
    catch (failure) { if (current === version.current) { setError(failure.message); if ([401, 403, 404].includes(failure.status)) setData(null); } }
  }, [roomId]);
  const more = async () => {
    const current = version.current;
    setLoadingMore(true);
    try {
      const next = roomId ? await callArchiveApi.room(roomId, data.nextCursor) : await callArchiveApi.rooms(data.nextCursor);
      if (current === version.current) setData(previous => ({ ...previous, ...next, [roomId ? 'sessions' : 'rooms']: [...(previous[roomId ? 'sessions' : 'rooms'] || []), ...(next[roomId ? 'sessions' : 'rooms'] || [])] }));
    } catch (failure) { if (current === version.current) setError(failure.message); }
    finally { setLoadingMore(false); }
  };
  useEffect(() => { setData(null); setError(''); void load(); return () => { version.current++; }; }, [load]);
  const select = (room, session = '') => {
    setRoomId(String(room || '')); setSessionId(String(session || ''));
    const url = room ? new URL(callArchiveLink(room, session)) : new URL(window.location.href);
    if (!room) { url.searchParams.delete('callArchiveRoom'); url.searchParams.delete('callSession'); }
    window.history.replaceState(window.history.state, '', url);
    setSearch('');
  };
  useEffect(() => {
    const pop = () => { setRoomId(initial('callArchiveRoom')); setSessionId(initial('callSession')); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  if (sessionId) return <CallArchiveSession key={sessionId} sessionId={sessionId} onBack={() => select(roomId)} />;
  const rooms = (data?.rooms || []).filter(room => String(room.name || '').includes(search.trim()));
  return <div className="min-w-0">
    <ManagementToolbar>{roomId && <Button variant="outline" onClick={() => select('')}>كل الغرف</Button>}
      {!roomId && <Input type="search" aria-label="ابحث في أرشيف المكالمات" placeholder="ابحث باسم الغرفة" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1" />}
      <Button variant="ghost" onClick={load}>تحديث الأرشيف</Button>
    </ManagementToolbar>
    {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div> : !data ? <DashboardLoader /> : roomId ? <>
      <div className="space-y-2 px-4 py-4 sm:px-6"><h2 className="break-words text-lg font-bold">{data.room?.name || 'جلسات الغرفة'}</h2><p className="text-sm text-muted-foreground">{data.room?.status === 'closed' ? 'الغرفة مغلقة وأرشيفها محفوظ.' : 'جلسات محفوظة داخل الغرفة.'}</p></div>
      {!data.sessions?.length ? <ManagementEmpty>لا توجد جلسات محفوظة لهذه الغرفة بعد.</ManagementEmpty> : <ManagementList label="جلسات المكالمة">{data.sessions.map(session => <ManagementRow key={session.id} title={callDate(session.startedAt)} subtitle={recordingLabel(session.state)} openLabel={`فتح جلسة ${callDate(session.startedAt)}`} onOpen={() => select(roomId, session.id)} />)}</ManagementList>}
    </> : <>
      {data.capabilities?.message && <p role="status" className="px-4 py-3 text-sm text-muted-foreground sm:px-6">{data.capabilities.message}</p>}
      {!rooms.length ? <ManagementEmpty>{search ? 'لا توجد غرف مطابقة للبحث في النتائج المحمّلة.' : 'لا توجد جلسات مؤرشفة بعد.'}</ManagementEmpty> : <ManagementList label="أرشيف المكالمات">{rooms.map(room => <ManagementRow key={room.id} title={room.name} subtitle={`${room.status === 'closed' ? 'مغلقة' : room.status === 'open' ? 'مفتوحة' : 'مؤرشفة'} · عدد الجلسات: ${room.sessionCount || 0}`} openLabel={`أرشيف ${room.name}`} onOpen={() => select(room.id)} />)}</ManagementList>}
    </>}
    {data?.nextCursor && <div className="px-4 py-3"><Button variant="outline" loading={loadingMore} onClick={more}>تحميل المزيد</Button></div>}
  </div>;
}
