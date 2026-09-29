import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import StudentNewsArtwork from './StudentNewsArtwork';

export default function StudentNewsCard({ news, active = true }) {
  const entries = news?.entries || [];
  const images = entries.map(entry => entry.image);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const start = useRef(null);
  const current = index % Math.max(images.length, 1);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!active || images.length < 2 || paused || reducedMotion || expanded) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setIndex(value => (value + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [active, images.length, paused, reducedMotion, expanded]);
  if (!images.length) return null;
  const title = entries[current].title;
  const select = value => { setIndex((value + images.length) % images.length); setPaused(true); };
  return <section aria-label="الأخبار" className="relative min-w-0 overflow-hidden rounded-2xl border border-primary/15 bg-card [font-family:var(--font-ui)]" dir="rtl">
    <div className="absolute left-1 top-1 z-10">
      {active && images.length > 1 && !reducedMotion && <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 bg-card/90"
        aria-label={paused ? 'تشغيل تبديل الصور' : 'إيقاف تبديل الصور'} onClick={() => setPaused(value => !value)}>
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </Button>}
    </div>
    <div className="relative flex h-[280px] flex-col sm:h-[320px]">
    <Button variant="ghost" className="absolute inset-0 z-[1] !h-full w-full touch-pan-y rounded-none !p-0 hover:translate-y-0 hover:bg-transparent active:scale-100"
      aria-label={`عرض الخبر ${current + 1}: ${title}`} onFocus={() => setPaused(true)}
      onPointerDown={event => { start.current = event.clientX; }}
      onPointerCancel={() => { start.current = null; }}
      onPointerUp={event => {
        if (start.current !== null && Math.abs(event.clientX - start.current) > 35) {
          select(current + (event.clientX > start.current ? 1 : -1));
          start.current = 'swiped';
        }
      }}
      onClick={() => { if (start.current !== 'swiped') { setPaused(true); setExpanded(true); } start.current = null; }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); select(current + (event.key === 'ArrowLeft' ? 1 : -1));
        }
      }} />
    <StudentNewsArtwork entry={entries[current]} />
    </div>
    {images.length > 1 && <div className="flex flex-wrap justify-center" aria-label="صور الأخبار">
      {entries.map((entry, item) => <Button key={entry.id} variant="ghost" size="icon" className="h-11 w-11 min-w-0 rounded-none px-0"
        aria-label={`الصورة ${item + 1}`} aria-pressed={item === current} onClick={() => select(item)}>
        <span className={`h-1.5 rounded-full ${item === current ? 'w-5 bg-primary' : 'w-1.5 bg-primary/25'}`} />
      </Button>)}
    </div>}
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-w-3xl [font-family:var(--font-ui)]" dir="rtl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <StudentNewsArtwork entry={entries[current]} expanded />
        <Button variant="outline" onClick={() => setExpanded(false)}>إغلاق</Button>
      </DialogContent>
    </Dialog>
  </section>;
}
