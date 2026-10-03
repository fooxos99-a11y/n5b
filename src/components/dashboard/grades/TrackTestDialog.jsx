import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GradeCounter from './GradeCounter';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { gradingApi } from '@/services/gradingApi';
import { formatQuranRangeText } from '@/lib/quranRangeText';

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
  const load = useCallback(async () => {
    setError('');
    setAttempt(null);
    setSegments([]);
    setIndex(0);
    try {
      const result = await gradingApi.prepareTrackTest({ studentId: student.id, weekStart });
      setAttempt(result);
      setSegments(result.segments.map(item => ({ ...item, mistakes: 0, warnings: 0, hesitations: 0 })));
    } catch (requestError) { setError(requestError.message || 'تعذر إعداد مقاطع الاختبار.'); }
  }, [student.id, weekStart]);
  useEffect(() => { load(); }, [load]);
  const segmentCount = segments.length;
  const segment = segments[index];
  const last = index >= segmentCount - 1;

  const update = (patch) => setSegments((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const next = () => {
    if (!last) {
      setIndex(index + 1);
      return;
    }
    onSave(segments.map((item) => ({ ...item, recorded: true })), attempt.attemptToken);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-md gap-4 [font-family:var(--font-ui)]">
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
        </div>}
        {segment && (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            <GradeCounter label="الأخطاء" value={segment.mistakes} disabled={saving} onChange={(mistakes) => update({ mistakes })} />
            <GradeCounter label="الترددات" value={segment.hesitations} disabled={saving} onChange={(hesitations) => update({ hesitations })} />
            <GradeCounter label="التنبيهات" value={segment.warnings} disabled={saving} onChange={(warnings) => update({ warnings })} />
          </div>
        )}
        {index > 0 && <Button type="button" variant="outline" disabled={saving} onClick={() => setIndex(index - 1)}>المقطع السابق</Button>}
        <Button type="button" className="h-11 w-full" loading={saving && last} disabled={saving || !segment} onClick={next}>
          {last ? 'حفظ' : 'التالي'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
