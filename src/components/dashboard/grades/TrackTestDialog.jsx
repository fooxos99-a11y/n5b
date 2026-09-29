import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GradeCounter from './GradeCounter';

const initialSegments = (count) => Array.from({ length: count }, () => ({ mistakes: 0, warnings: 0 }));

/**
 * Track session test: mistakes and warnings of one segment at a time,
 * «التالي» moves to the next segment and the last one saves.
 * Every attempt starts empty; saving replaces the previous result.
 */
export default function TrackTestDialog({ student, segmentCount, saving, onSave, onClose }) {
  const [segments, setSegments] = useState(() => initialSegments(segmentCount));
  const [index, setIndex] = useState(0);
  const segment = segments[index];
  const last = index >= segmentCount - 1;

  const update = (patch) => setSegments((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  const next = () => {
    if (!last) {
      setIndex(index + 1);
      return;
    }
    onSave(segments.map((item) => ({ ...item, recorded: true })));
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
        {segment && (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            <GradeCounter label="الأخطاء" value={segment.mistakes} disabled={saving} onChange={(mistakes) => update({ mistakes })} />
            <GradeCounter label="التنبيهات" value={segment.warnings} disabled={saving} onChange={(warnings) => update({ warnings })} />
          </div>
        )}
        {index > 0 && <Button type="button" variant="outline" disabled={saving} onClick={() => setIndex(index - 1)}>المقطع السابق</Button>}
        <Button type="button" className="h-11 w-full" loading={saving && last} disabled={saving} onClick={next}>
          {last ? 'حفظ' : 'التالي'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
