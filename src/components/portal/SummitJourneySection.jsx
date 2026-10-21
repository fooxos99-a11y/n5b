import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { summitApi } from '@/services/summitApi';
import SummitJourneyMap from '@/components/summit/SummitJourneyMap';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
export default function SummitJourneySection({ onBack }) {
  const [journey, setJourney] = useState(null), [displayed, setDisplayed] = useState(0), [selected, setSelected] = useState(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const revision = useRef(0), frame = useRef(0), moving = useRef(false), initialized = useRef(false), stationId = useRef(null);
  const configRevision = useRef(null);
  const load = useCallback(async () => {
    const current = ++revision.current;
    try {
      const value = await summitApi.journey();
      if (current !== revision.current) return;
      setJourney(value); setError('');
      if (!initialized.current || stationId.current !== value.activeStation?.id || configRevision.current !== value.revision) {
        window.cancelAnimationFrame(frame.current); moving.current = false;
        setDisplayed(Number(value.displayedKilometers || 0)); setSelected(null);
        initialized.current = true; stationId.current = value.activeStation?.id; configRevision.current = value.revision;
      }
    } catch (cause) { if (current === revision.current) setError(cause.message); }
  }, []);
  useEffect(() => {
    void load(); const timer = window.setInterval(() => void load(), 20_000);
    const focus = () => void load(); window.addEventListener('focus', focus);
    return () => { revision.current++; window.clearInterval(timer); window.cancelAnimationFrame(frame.current); window.removeEventListener('focus', focus); };
  }, [load]);
  useEffect(() => {
    if (!journey?.enabled || journey.activeStation || selected || moving.current || displayed === journey.points) return;
    const stage = journey.stages.find(item => item.notificationEnabled && !item.completed && item.points > displayed && item.points <= journey.points);
    const target = stage?.points ?? journey.points, from = displayed;
    const start = performance.now(), duration = Math.min(7000, Math.max(1200, Math.abs(target - from) * 9));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    moving.current = true;
    const animate = now => {
      const ratio = reduce ? 1 : Math.min(1, (now - start) / duration);
      setDisplayed(Math.round(from + (target - from) * (1 - (1 - ratio) ** 3)));
      if (ratio < 1) { frame.current = window.requestAnimationFrame(animate); return; }
      moving.current = false;
      if (stage) setSelected(stage);
      else void summitApi.progress(target).catch(cause => setError(cause.message));
    };
    frame.current = window.requestAnimationFrame(animate);
  }, [journey, displayed, selected]);
  const acknowledge = async () => {
    setSaving(true); setError('');
    try {
      await summitApi.acknowledge(selected.id);
      await summitApi.progress(Math.min(displayed, journey.points));
      setJourney(current => current?.stages ? { ...current, stages: current.stages.map(stage => stage.id === selected.id ? { ...stage, completed: true } : stage) } : current);
      setSelected(null);
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  };
  return <section className="relative h-dvh w-full overflow-hidden [font-family:var(--font-ui)]" dir="rtl">
    <Button className="absolute right-3 top-[calc(env(safe-area-inset-top)+.75rem)] z-[70] h-11 w-11 bg-card text-foreground shadow-lg" size="icon" variant="outline" onClick={onBack} aria-label="رجوع"><ArrowRight /></Button>
    {!journey ? error ? <div className="p-16"><ErrorState message={error} onRetry={load} /></div> : <DashboardLoader className="h-full" />
      : !journey.enabled ? <p className="p-16 text-center">الخريطة غير مفعّلة.</p>
        : <SummitJourneyMap journey={{ ...journey, points: journey.activeStation ? journey.activeStation.kilometer : displayed }} onStageClick={setSelected} />}
    {error && journey && !selected && <div className="absolute bottom-4 left-4 right-4 z-[70] rounded-xl bg-card p-3"><ErrorState message={error} onRetry={load} /></div>}
    <Dialog open={Boolean(selected)}>
      <DialogContent dir="rtl" className="[font-family:var(--font-ui)]" onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>وصلت إلى {selected?.name}</DialogTitle></DialogHeader>
        <p className="text-sm leading-7">{selected?.notificationText}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button className="min-h-11" loading={saving} disabled={saving} onClick={acknowledge}>متابعة الرحلة</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
