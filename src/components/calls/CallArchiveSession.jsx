import React, { useCallback, useEffect, useRef, useState } from 'react';
import PageBackButton from '@/components/ui/page-back-button';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CallArchivePlayer from './CallArchivePlayer';
import CallArchiveReport from './CallArchiveReport';
import { callArchiveApi } from '@/services/callArchiveApi';
import { callDate, callTime, callSessionTitle, callSessionPeople } from '@/lib/callArchivePresentation';

export default function CallArchiveSession({ sessionId, onBack }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [actionMessage, setActionMessage] = useState(''), [retrying, setRetrying] = useState(false);
  const player = useRef(null), alive = useRef(0);
  const load = useCallback(async () => {
    const version = alive.current;
    try { const next = await callArchiveApi.session(sessionId); if (version === alive.current) { setData(next); setError(''); } }
    catch (failure) { if (version === alive.current) { setError(failure.message); if ([401, 403, 404].includes(failure.status)) setData(null); } }
  }, [sessionId]);
  useEffect(() => {
    alive.current++; setData(null); setError(''); void load();
    return () => { alive.current++; };
  }, [load]);
  const active = data && (['starting', 'recording', 'stopping', 'processing'].includes(data.session.state) || ['pending', 'processing'].includes(data.session.reportState));
  useEffect(() => { if (!active) return undefined; const timer = window.setInterval(() => void load(), 6000); return () => window.clearInterval(timer); }, [active, load]);
  const retry = async () => {
    setRetrying(true); setActionMessage('');
    try { await callArchiveApi.retry(sessionId); setActionMessage('أُعيدت جدولة المحاولة.'); await load(); }
    catch (failure) { setActionMessage(failure.message); }
    finally { setRetrying(false); }
  };
  const primary = data?.media?.find(item => item.kind === 'mixed' && item.available);
  return <div className="min-w-0 space-y-4 p-4 sm:p-6">
    <PageBackButton iconOnly label="الرجوع إلى المكالمات" onClick={onBack} />
    <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="تفاصيل المكالمة">
    {error && <ErrorState message={error} onRetry={load} />}
    {!data && !error && <DashboardLoader />}
    {data && <>
      <div className="space-y-2"><h2 className="break-words text-lg font-bold">{callSessionTitle(data.session)}{callSessionPeople(data.participants) ? `: ${callSessionPeople(data.participants)}` : ''}</h2><p className="text-sm text-muted-foreground">{callDate(data.session.startedAt)} · {data.session.endedAt ? callTime((Date.parse(data.session.endedAt) - Date.parse(data.session.startedAt)) / 1000) : data.session.roomName}</p></div>
      <div><h3 className="mb-2 font-bold">المشاركون</h3><ul className="space-y-1 text-sm">{(data.participants || []).map((person, index) => <li key={`${person.identity || person.id || index}`} className="flex flex-wrap justify-between gap-2"><span>{person.name || person.identity || 'مشارك'}</span><span className="text-xs text-muted-foreground">{callDate(person.joinedAt || person.firstJoinedAt)} — {person.leftAt || person.lastLeftAt ? callDate(person.leftAt || person.lastLeftAt) : '—'}</span></li>)}</ul></div>
      <div className="space-y-3">{primary && <CallArchivePlayer key={primary.id} ref={player} sessionId={sessionId} media={primary} />}
        {!primary && <p role={data.session.state === 'failed' ? 'alert' : 'status'} className="text-sm text-muted-foreground">{data.session.state === 'failed' ? 'تعذر حفظ تسجيل المكالمة.' : data.session.active ? 'جارٍ تسجيل المكالمة.' : ['starting', 'stopping', 'processing'].includes(data.session.state) ? 'جارٍ حفظ التسجيل.' : 'لا يتوفر تسجيل لهذه المكالمة.'}</p>}</div>
      {data.report && <CallArchiveReport sessionId={sessionId} report={data.report} canReview={data.canReview ?? data.session.canReview} onSeek={primary ? seconds => player.current?.seek(seconds) : undefined} onSaved={load} />}
      {Boolean(data.canReview ?? data.session.canReview) && ((data.session.active && data.session.state === 'failed') || (!data.session.active && primary && data.session.reportState === 'failed')) && <Button variant="outline" loading={retrying} onClick={retry}>{data.session.active ? 'إعادة محاولة التسجيل' : 'إعادة إعداد التقرير'}</Button>}
      {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
    </>}
    </section>
  </div>;
}
