import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { callArchiveApi } from '@/services/callArchiveApi';

const CallArchivePlayer = forwardRef(function CallArchivePlayer({ sessionId, media }, ref) {
  const audio = useRef(null), pendingSeek = useRef(0), version = useRef(0);
  const expiresAt = useRef(Infinity);
  const [source, setSource] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const load = async (position = 0) => {
    const current = ++version.current;
    setLoading(true); setError(''); pendingSeek.current = position;
    try {
      const data = await callArchiveApi.playback(sessionId, media.id);
      if (current === version.current) { expiresAt.current = data.expiresAt ? Date.parse(data.expiresAt) : Infinity; setSource(data.url); }
    } catch (failure) { if (current === version.current) setError(failure.message); }
    finally { if (current === version.current) setLoading(false); }
  };
  useEffect(() => () => { version.current++; }, []);
  useImperativeHandle(ref, () => ({ seek: seconds => {
    pendingSeek.current = Math.max(0, Number(seconds) || 0);
    if (!source || expiresAt.current <= Date.now()) void load(pendingSeek.current);
    else if (audio.current) { audio.current.currentTime = pendingSeek.current; void audio.current.play().catch(() => {}); }
  } }));
  return <div className="min-w-0 space-y-2 rounded-xl border border-border p-3">
    <p className="text-sm font-bold">{media.kind === 'mixed' ? 'تسجيل المكالمة' : media.name ? `تسجيل ${media.name}` : 'تسجيل أحد المشاركين'}</p>
    {!source && <Button variant="outline" loading={loading} onClick={() => load()}>تشغيل التسجيل</Button>}
    {source && <audio ref={audio} className="w-full min-w-0" controls preload="metadata" src={source}
      aria-label={media.kind === 'mixed' ? 'تسجيل المكالمة' : 'تسجيل المشارك'}
      onLoadedMetadata={() => { if (audio.current && pendingSeek.current) { audio.current.currentTime = pendingSeek.current; pendingSeek.current = 0; void audio.current.play().catch(() => {}); } }}
      onPlay={() => { if (expiresAt.current <= Date.now()) { audio.current?.pause(); void load(audio.current?.currentTime || 0); } }}
      onError={() => { if (expiresAt.current <= Date.now()) void load(audio.current?.currentTime || pendingSeek.current); else setError('تعذر تشغيل التسجيل. أعد تجهيز الرابط للمتابعة.'); }} />}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" loading={loading} onClick={() => load(audio.current?.currentTime || pendingSeek.current)}>إعادة تجهيز الرابط</Button></div>}
  </div>;
});
export default CallArchivePlayer;
