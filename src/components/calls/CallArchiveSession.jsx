import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import CallArchivePlayer from './CallArchivePlayer';
import CallArchiveReport from './CallArchiveReport';
import { callArchiveApi } from '@/services/callArchiveApi';
import { callArchiveLink, callDate, recordingLabel, reportLabel } from '@/lib/callArchivePresentation';

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
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(callArchiveLink(data.session.roomId, sessionId)); setActionMessage('نُسخ رابط الجلسة.'); }
    catch { setActionMessage('تعذر نسخ الرابط. يمكنك نسخه من شريط العنوان.'); }
  };
  const primary = data?.media?.find(item => item.kind === 'mixed' && item.available);
  return <div className="min-w-0 space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onBack}>العودة إلى الجلسات</Button>{data && <><Button variant="outline" onClick={copyLink}>نسخ رابط الجلسة</Button><Button variant="ghost" onClick={load}>تحديث</Button></>}</div>
    {error && <ErrorState message={error} onRetry={load} />}
    {!data && !error && <DashboardLoader />}
    {data && <>
      <div className="space-y-2"><h2 className="break-words text-lg font-bold">{data.session.roomName}</h2><p className="text-sm text-muted-foreground">{callDate(data.session.startedAt)} · {data.session.committeeName || 'غرفة عامة'}</p></div>
      <div role="status" className="flex flex-wrap gap-3 rounded-xl bg-muted p-3 text-sm"><span>{recordingLabel(data.session.state)}</span><span>{reportLabel(data.session.reportState)}</span></div>
      {data.session.recordingGap && <p role="alert" className="text-sm text-destructive">قد يحتوي التسجيل على جزء مفقود. راجع حالة التسجيل قبل اعتماد التقرير.</p>}
      {data.session.lastError && <p role="alert" className="text-sm text-destructive">{data.session.lastError}</p>}
      <div><h3 className="mb-2 font-bold">المشاركون</h3><ul className="space-y-1 text-sm">{(data.participants || []).map((person, index) => <li key={`${person.identity || person.id || index}`} className="flex flex-wrap justify-between gap-2"><span>{person.name || person.identity || 'مشارك'}</span><span className="text-xs text-muted-foreground">{callDate(person.joinedAt || person.firstJoinedAt)} — {person.leftAt || person.lastLeftAt ? callDate(person.leftAt || person.lastLeftAt) : '—'}</span></li>)}</ul></div>
      <div className="space-y-3">{primary && <CallArchivePlayer key={primary.id} ref={player} sessionId={sessionId} media={primary} />}{(data.media || []).filter(item => item.available && item.id !== primary?.id).map(item => <CallArchivePlayer key={item.id} sessionId={sessionId} media={{ ...item, name: data.participants?.find(person => person.identity === item.identity)?.name }} />)}
        {!data.media?.some(item => item.available) && <p className="text-sm text-muted-foreground">لا يتوفر ملف صوتي جاهز لهذه الجلسة بعد.</p>}</div>
      {data.report && <CallArchiveReport sessionId={sessionId} report={data.report} canReview={data.canReview ?? data.session.canReview} onSeek={primary ? seconds => player.current?.seek(seconds) : undefined} onSaved={load} />}
      {Boolean(data.canReview ?? data.session.canReview) && ((data.session.active && data.session.lastError) || (!data.session.active && primary && ['failed', 'unconfigured'].includes(data.session.reportState))) && <Button variant="outline" loading={retrying} onClick={retry}>{data.session.active ? 'إعادة محاولة التسجيل' : 'إعادة إعداد التقرير'}</Button>}
      {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
    </>}
  </div>;
}
