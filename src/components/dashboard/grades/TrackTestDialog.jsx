import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GradeCounter from './GradeCounter';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { gradingApi } from '@/services/gradingApi';
import { formatQuranRangeText } from '@/lib/quranRangeText';
import { trackWordMarkCounts, updateTrackWordMarks } from '../../../../shared/track-word-marks.js';

const MushafRecitationDialog = lazy(() => import('@/components/portal/MushafRecitationDialog'));

/**
 * Track session test: mistakes and warnings of one segment at a time,
 * «التالي» moves to the next segment and the last one saves.
 * Every attempt starts empty; saving replaces the previous result.
 */
export default function TrackTestDialog({ student, weekStart, saving, onSave, onClose }) {
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState('');
  const [segments, setSegments] = useState([]);
  const [index, setIndex] = useState(0);
  const [mushafOpen, setMushafOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submittingRef = useRef(false);
  const mushafOpenRef = useRef(false);
  mushafOpenRef.current = mushafOpen;
  const load = useCallback(async () => {
    setError('');
    setAttempt(null);
    setSegments([]);
    setIndex(0);
    try {
      const result = await gradingApi.prepareTrackTest({ studentId: student.id, weekStart });
      setAttempt(result);
      setSegments(result.segments.map(item => ({ ...item, mistakes: 0, warnings: 0, hesitations: 0, wordMarks: [] })));
    } catch (requestError) { setError(requestError.message || 'تعذر إعداد مقاطع الاختبار.'); }
  }, [student.id, weekStart]);
  useEffect(() => { load(); }, [load]);
  const segmentCount = segments.length;
  const segment = segments[index];
  const last = index >= segmentCount - 1;
  const busy = saving || submitting;
  const changeSegment = nextIndex => {
    if (busy || nextIndex < 0 || nextIndex >= segmentCount) return;
    setIndex(nextIndex);
  };

  const update = (patch) => setSegments((current) => current.map((item, position) => {
    if (position !== index) return item;
    const minimum = trackWordMarkCounts(item.wordMarks);
    return { ...item, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, Math.max(value, minimum[key] || 0)])) };
  }));
  const updateMarks = wordMarks => setSegments(current => current.map((item, position) => position === index
    ? updateTrackWordMarks(item, wordMarks) : item));
  const loadMushaf = async () => ({
    ...await gradingApi.getTrackTestMushaf({ studentId: student.id, weekStart, attemptToken: attempt.attemptToken, segmentIndex: index }),
    wordMarks: segment.wordMarks,
  });
  const saveSession = async () => {
    if (busy || submittingRef.current || !attempt || !segments.length) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await onSave(segments.map(item => ({ ...item, recorded: true })), attempt.attemptToken);
      if (saved === false) setSubmitError('تعذر حفظ جلسة المسار. حاول مرة أخرى.');
    } catch (requestError) {
      setSubmitError(requestError.message || 'تعذر حفظ جلسة المسار. حاول مرة أخرى.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const next = () => {
    if (!last) {
      setIndex(index + 1);
      return;
    }
    void saveSession();
  };

  return (
    <>
    {!mushafOpen && <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-md gap-4 [font-family:var(--font-ui)]"
        onCloseAutoFocus={event => { if (mushafOpenRef.current) event.preventDefault(); }}>
        <DialogHeader className="space-y-1 text-right">
          <DialogTitle className="break-words">{student.name}</DialogTitle>
          {segmentCount > 1 && (
            <p className="text-sm font-bold text-muted-foreground" aria-live="polite">المقطع {index + 1} من {segmentCount}</p>
          )}
        </DialogHeader>
        {error ? <ErrorState message={error} onRetry={load} /> : !attempt && <DashboardLoader className="min-h-32" />}
        {segment && <div className="space-y-2 text-sm">
          <p className="font-black">{segment.source === 'review' ? 'مقطع المراجعة' : 'مقطع الربط'} · {segment.max} درجات</p>
          <p>{formatQuranRangeText({ startSurah: segment.range.fromSurah, startAyah: segment.range.fromAyah,
            endSurah: segment.range.toSurah, endAyah: segment.range.toAyah,
            startSurahName: segment.range.fromSurahName, endSurahName: segment.range.toSurahName })}</p>
          <Button type="button" variant="outline" className="h-11 w-full" disabled={busy} onClick={() => setMushafOpen(true)}>فتح المصحف</Button>
        </div>}
        {segment && (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            <GradeCounter label="الأخطاء" value={segment.mistakes} disabled={busy} onChange={(mistakes) => update({ mistakes })} />
            <GradeCounter label="الترددات" value={segment.hesitations} disabled={busy} onChange={(hesitations) => update({ hesitations })} />
            <GradeCounter label="التنبيهات" value={segment.warnings} disabled={busy} onChange={(warnings) => update({ warnings })} />
          </div>
        )}
        {index > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => changeSegment(index - 1)}>المقطع السابق</Button>}
        {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
        <Button type="button" className="h-11 w-full" loading={(saving || submitting) && last} disabled={busy || !segment} onClick={next}>
          {last ? 'حفظ' : 'التالي'}
        </Button>
      </DialogContent>
    </Dialog>}
    {mushafOpen && segment && <Suspense fallback={<DashboardLoader />}>
      <MushafRecitationDialog key={`${index}:${segment.range.fromSurah}:${segment.range.fromAyah}:${segment.range.toSurah}:${segment.range.toAyah}`}
        open onOpenChange={open => { if (!busy) setMushafOpen(open); }} interactionDisabled={busy}
        tasks={[{ id: index + 1, ...segment.range }]} loadTaskData={loadMushaf}
        renderSessionActions={({ disabled }) => <div className="mx-auto w-full max-w-3xl space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center">
            {segmentCount > 1 && <Button type="button" variant="outline" className="sm:order-1" disabled={disabled || busy || index === 0} onClick={() => changeSegment(index - 1)}>المقطع السابق</Button>}
            {segmentCount > 1 && <Button type="button" variant="outline" className="sm:order-3" disabled={disabled || busy || last} onClick={() => changeSegment(index + 1)}>المقطع التالي</Button>}
          </div>
          {submitError && <p role="alert" className="text-center text-sm text-destructive">{submitError}</p>}
        </div>}
        onMarksChange={marks => updateMarks(marks[String(index + 1)] || [])}
        onFinishSession={saveSession} />
    </Suspense>}
    </>
  );
}
